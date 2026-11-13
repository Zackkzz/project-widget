import { RequestScheduler } from './requestScheduler';
import { SubformReadCache } from './subformReadCache';
import {
  ExpiringReadCache,
  referenceReadTtl,
  cacheableReferenceResponse,
} from './expiringReadCache';
import { SnapshotStore } from './snapshotStore';
import { EditorDraftStore } from './editorDraftStore';
export { mergeEditorDraft } from './draftRecovery';
export { recoveryPanel } from './recoveryPanel';
export { hydrateMissingFields } from '../services/subformHydration';
import type {
  CachedRecord,
  CacheScope,
  CreatorSdk,
  RecordsGateway,
  RecordPage,
  ProjectSnapshot,
} from './types/project-cache.types';

/** Runs related-row hydration concurrently without issuing unbounded SDK requests. */
export async function mapConcurrent<T, R>(
  rows: T[],
  transform: (row: T) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const result: R[] = new Array(rows.length);
  let next = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (!failed && next < rows.length) {
        const index = next++;
        try {
          result[index] = await transform(rows[index]);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  return result;
}

/** Adds optional persistent snapshots, bounded prefetch, and shared request scheduling to Creator. */
export function createProjectCacheRuntime(
  sdk: CreatorSdk,
  identity: CacheScope,
  bomFields: string[],
) {
  const scope = JSON.stringify([location.origin, identity.app, identity.user || 'anonymous']);
  const store = new SnapshotStore(scope, !!identity.user);
  const drafts = new EditorDraftStore(scope);
  const scheduler = new RequestScheduler(4);
  const references = new ExpiringReadCache<unknown>(32, structuredClone);
  const subforms = new SubformReadCache();
  let readGeneration = 0;

  function scheduledSdk(priority: number): CreatorSdk {
    return {
      ...sdk,
      DATA: new Proxy(sdk.DATA, {
        get(data, name: string) {
          const method = data[name];
          if (!['getRecords', 'getRecordById'].includes(name) || typeof method !== 'function')
            return typeof method === 'function' ? method.bind(data) : method;
          return (...args: never[]) => {
            const generation = readGeneration;
            const key = `${generation}:${name}:${JSON.stringify(args)}`;
            const read = () =>
              scheduler.read(key, priority, () => {
                if (generation !== readGeneration) throw new Error('Superseded background read.');
                return Promise.resolve(method.apply(data, args));
              });
            const ttl = name === 'getRecords' ? referenceReadTtl(args[0]) : 0;
            return ttl ? references.read(key, ttl, read, cacheableReferenceResponse) : read();
          };
        },
      }),
    };
  }

  function attach(foreground: RecordsGateway, background: RecordsGateway) {
    let epoch = 0;
    let busyWrites = 0;
    let disposed = false;
    let backgroundActive = false;
    const signatures = new ExpiringReadCache<Blob>(8);
    const boundMethods = new Map<string, (...args: unknown[]) => unknown>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requests = new Map<string, Promise<unknown>>();
    const queue: string[] = [];
    const attempted = new Map<string, number>();
    let channel: BroadcastChannel | undefined;
    try {
      if (identity.user && typeof BroadcastChannel !== 'undefined')
        channel = new BroadcastChannel(`project-widget-records:${scope}`);
    } catch {
      // Embedded browsers can allow IndexedDB while restricting BroadcastChannel.
    }

    function invalidate(broadcast = true): void {
      epoch++;
      readGeneration++;
      references.clear();
      subforms.clear();
      signatures.clear();
      requests = new Map();
      queue.length = 0;
      attempted.clear();
      store.clear();
      if (broadcast) channel?.postMessage('invalidate');
    }
    if (channel) channel.onmessage = () => invalidate(false);

    function once<T>(key: string, work: () => Promise<T>): Promise<T> {
      const pending = requests.get(key);
      if (pending) return pending as Promise<T>;
      const promise = work();
      requests.set(key, promise);
      void promise
        .finally(() => {
          if (requests.get(key) === promise) requests.delete(key);
        })
        .catch(() => {});
      return promise;
    }

    function project(id: string, source = foreground): Promise<CachedRecord> {
      return once(`project:${id}`, async () => {
        const generation = epoch;
        const record = await source.get(id);
        const previous = store.peek(id)?.record;
        const signatureVersions = (value: CachedRecord) =>
          JSON.stringify(
            Array.isArray(value.raw.Milestone_Tracker)
              ? value.raw.Milestone_Tracker.map((row) => [row.ID, row.Signature])
              : value.raw.Milestone_Tracker,
          );
        if (
          generation === epoch &&
          previous &&
          signatureVersions(previous) !== signatureVersions(record)
        )
          signatures.clear();
        if (generation === epoch && !busyWrites)
          store.put(id, { record, projectFetchedAt: Date.now() });
        return record;
      });
    }

    function boms(
      id: string,
      source = foreground,
      baseline?: CachedRecord,
    ): Promise<CachedRecord[]> {
      return once(`bom:${id}`, async () => {
        const generation = epoch;
        const records = new Map<string, CachedRecord>();
        const seenCursors = new Set<string>();
        let backgroundBytes = 0;
        let cursor: string | undefined;
        do {
          // An empty embedded BOM has historically omitted linked records, so verify via its report.
          const embedded = baseline?.raw.BOM;
          const page: RecordPage =
            !cursor && Array.isArray(embedded) && embedded.length
              ? {
                  records: embedded.map((raw) => {
                    if (!raw || typeof raw !== 'object' || typeof raw.ID !== 'string' || !raw.ID)
                      throw new Error('Zoho returned a BOM row without a record ID.');
                    return { id: raw.ID, raw };
                  }),
                }
              : await source.bom(id, cursor);
          // Complete report rows are already equivalent editor baselines; only expand sparse rows.
          const expanded = await mapConcurrent(page.records, async (row) => {
            const raw = await subforms.hydrate(
              { ...row.raw, ID: row.id },
              bomFields,
              async (rowId, missing) =>
                source.getBomFields
                  ? (await source.getBomFields(rowId, missing)).raw
                  : (await source.getBom(rowId)).raw,
              { report: 'BOM_Record', projectId: id, revision: baseline?.raw.Modified_Time },
            );
            return { ...row, raw, reportBaseline: true };
          });
          if (source === background) {
            backgroundBytes += new TextEncoder().encode(JSON.stringify(expanded)).byteLength;
            if (backgroundBytes > store.limits.memoryBytes / 2)
              throw new Error('This BOM is too large for automatic prefetch.');
          }
          for (const record of expanded) records.set(record.id, record);
          cursor = page.cursor;
          if (cursor && seenCursors.has(cursor)) throw new Error('Creator repeated a BOM page.');
          if (cursor) seenCursors.add(cursor);
        } while (cursor);
        const bom = [...records.values()];
        if (generation === epoch && !busyWrites) store.put(id, { bom, bomFetchedAt: Date.now() });
        return bom;
      });
    }

    function fresh(snapshot: ProjectSnapshot | undefined): boolean {
      const threshold = Date.now() - store.limits.freshMs;
      return !!(
        snapshot?.record &&
        snapshot.bom &&
        (snapshot.projectFetchedAt ?? 0) > threshold &&
        (snapshot.bomFetchedAt ?? 0) > threshold
      );
    }

    function pump(): void {
      timer = undefined;
      if (disposed || backgroundActive || busyWrites || document.visibilityState === 'hidden')
        return;
      const id = queue.shift();
      if (!id) return;
      attempted.delete(id);
      attempted.set(id, Date.now());
      while (attempted.size > 20) attempted.delete(attempted.keys().next().value!);
      backgroundActive = true;
      void (async () => {
        const cached = await store.read(id);
        if (!fresh(cached)) {
          const record = await project(id, background);
          await boms(id, background, record);
        }
      })()
        .catch(() => {})
        .finally(() => {
          backgroundActive = false;
          if (queue.length) timer = setTimeout(pump, 500);
        });
    }

    function prefetch(id: string, urgent = false): void {
      if (
        disposed ||
        !id ||
        busyWrites ||
        store.hasFreshEditor(id) ||
        Date.now() - (attempted.get(id) ?? 0) < store.limits.freshMs
      )
        return;
      const index = queue.indexOf(id);
      if (index >= 0) queue.splice(index, 1);
      if (urgent) queue.unshift(id);
      else queue.push(id);
      // One active project and at most two candidates, never the full loaded report.
      queue.splice(2);
      if (!timer && !backgroundActive) timer = setTimeout(pump, urgent ? 150 : 800);
    }

    function hover(event: Event): void {
      const element = event.target instanceof Element ? event.target : undefined;
      const row = element?.closest<HTMLElement>('[data-project-id]');
      const previous = (event as MouseEvent | FocusEvent).relatedTarget;
      // Pointer and focus events bubble between cells; warm only on entry to a new row.
      if (previous instanceof Node && row?.contains(previous)) return;
      if (row?.dataset.projectId) prefetch(row.dataset.projectId, true);
    }
    document.addEventListener('pointerover', hover, { passive: true });
    document.addEventListener('focusin', hover);
    const visibilityChanged = () => {
      if (!timer && queue.length) timer = setTimeout(pump, 500);
    };
    function disposeCache(): void {
      disposed = true;
      epoch++;
      readGeneration++;
      references.clear();
      subforms.clear();
      signatures.clear();
      if (timer) clearTimeout(timer);
      queue.length = 0;
      requests.clear();
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('focusin', hover);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', leaving);
      channel?.close();
      store.close();
    }
    function leaving(event: PageTransitionEvent): void {
      if (!event.persisted) disposeCache();
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', leaving);

    const signatureReader = foreground.readMilestoneSignature;
    const extras = {
      ...(typeof signatureReader === 'function'
        ? {
            readMilestoneSignature(projectId: string, milestoneId: string) {
              return signatures.read(
                JSON.stringify([projectId, milestoneId]),
                30_000,
                async () => {
                  const image = await signatureReader.call(foreground, projectId, milestoneId);
                  if (!(image instanceof Blob))
                    throw new Error('Zoho did not return signature image data.');
                  return image;
                },
                (image) => image.size <= 256 * 1024,
              );
            },
          }
        : {}),
      disposeCache,
      loadDraft: drafts.load.bind(drafts),
      saveDraft: drafts.save.bind(drafts),
      clearDraft: drafts.clear.bind(drafts),
      latestDraft: drafts.latest.bind(drafts),
      peekEditor: (id: string) => store.peek(id),
      cachedEditor: (id: string) => store.read(id),
      prefetch,
      async prepareEditor(id: string, isBom = false) {
        const generation = epoch;
        try {
          const record = isBom ? await foreground.getBom(id) : await project(id);
          const bom = isBom ? [] : await boms(id, foreground, record);
          if (generation !== epoch)
            throw new Error('Records changed while loading. Retry the editor.');
          return structuredClone({ record, bom });
        } catch (error) {
          // A rejected verification must not leave previously cached data trusted for this editor.
          if (generation === epoch) invalidate();
          throw error;
        }
      },
      async get(id: string): Promise<CachedRecord> {
        const snapshot = await store.read(id);
        if (
          snapshot?.record &&
          Date.now() - (snapshot.projectFetchedAt ?? 0) < store.limits.freshMs
        )
          return snapshot.record;
        return structuredClone(await project(id));
      },
      getFresh: (id: string) => project(id),
      async bom(id: string, cursor?: string) {
        const baseline = store.peek(id)?.record;
        if (!cursor && Array.isArray(baseline?.raw.BOM) && baseline.raw.BOM.length)
          return { records: await boms(id, foreground, baseline) };
        return foreground.bom(id, cursor);
      },
      async list(query: unknown) {
        const page = await foreground.list(query);
        for (const record of page.records.slice(0, 2)) prefetch(record.id);
        return page;
      },
    };

    return new Proxy(foreground, {
      get(target, name: string) {
        if (Object.hasOwn(extras, name)) return extras[name as keyof typeof extras];
        const method = target[name];
        // Match only mutation method prefixes, so read/get/list methods never clear the cache.
        if (/^(update|create|upload|save|delete|remove)/.test(name) && typeof method === 'function')
          return async (...args: unknown[]) => {
            busyWrites++;
            invalidate();
            try {
              return await method.apply(target, args);
            } finally {
              busyWrites--;
              invalidate();
            }
          };
        if (typeof method !== 'function') return method;
        if (!boundMethods.has(name)) boundMethods.set(name, method.bind(target));
        return boundMethods.get(name);
      },
    }) as RecordsGateway & typeof extras;
  }

  return {
    sdk: scheduledSdk(0),
    backgroundSdk: scheduledSdk(1),
    attach,
    hydrateSubformFields: subforms.hydrate.bind(subforms),
  };
}
