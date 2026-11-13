import type { CacheLimits, ProjectSnapshot, StoredSnapshot } from './types/project-cache.types';

const defaults: CacheLimits = {
  memoryProjects: 5,
  memoryBytes: 8 * 1024 * 1024,
  diskBytes: 25 * 1024 * 1024,
  maxAgeMs: 24 * 60 * 60 * 1000,
  freshMs: 30_000,
};

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** A bounded, user-scoped snapshot store. Disk failures leave memory caching operational. */
export class SnapshotStore {
  readonly limits: CacheLimits;
  private readonly memory = new Map<string, ProjectSnapshot>();
  private database?: Promise<IDBDatabase | undefined>;
  private writes: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(
    readonly scope: string,
    private readonly persistent: boolean,
    limits: Partial<CacheLimits> = {},
  ) {
    this.limits = { ...defaults, ...limits };
  }

  /** Checks timestamps without cloning record data or changing the eviction order. */
  hasFreshEditor(id: string): boolean {
    const snapshot = this.memory.get(id);
    const threshold = Date.now() - this.limits.freshMs;
    return !!(
      snapshot?.record &&
      snapshot.bom &&
      !this.expired(snapshot) &&
      (snapshot.projectFetchedAt ?? 0) > threshold &&
      (snapshot.bomFetchedAt ?? 0) > threshold
    );
  }

  peek(id: string): ProjectSnapshot | undefined {
    const snapshot = this.memory.get(id);
    if (!snapshot) return;
    if (this.expired(snapshot)) {
      this.memory.delete(id);
      return;
    }
    snapshot.accessedAt = Date.now();
    this.memory.delete(id);
    this.memory.set(id, snapshot);
    return structuredClone(snapshot);
  }

  async read(id: string): Promise<ProjectSnapshot | undefined> {
    const cached = this.peek(id);
    if (cached) return cached;
    const generation = this.generation;
    try {
      const database = await this.open();
      if (!database) return;
      const stored = await request<StoredSnapshot | undefined>(
        database.transaction('snapshots', 'readonly').objectStore('snapshots').get(id),
      );
      if (
        generation !== this.generation ||
        !stored ||
        stored.scope !== this.scope ||
        this.expired(stored)
      )
        return;
      this.remember(stored);
      return this.peek(id);
    } catch {
      return;
    }
  }

  put(id: string, patch: Partial<ProjectSnapshot>): void {
    const snapshot: ProjectSnapshot = {
      ...this.memory.get(id),
      ...structuredClone(patch),
      id,
      accessedAt: Date.now(),
      bytes: 0,
    };
    snapshot.bytes = new TextEncoder().encode(
      JSON.stringify({ ...snapshot, scope: this.scope }),
    ).byteLength;
    this.remember(snapshot);
    // A single huge BOM should not displace the entire persistent cache.
    if (snapshot.bytes > this.limits.diskBytes) return;
    const generation = this.generation;
    this.writes = this.writes
      .then(async () => {
        const database = await this.open();
        if (!database || generation !== this.generation) return;
        const transaction = database.transaction('snapshots', 'readwrite');
        const done = completed(transaction);
        const store = transaction.objectStore('snapshots');
        store.put({ ...snapshot, scope: this.scope });
        const rows = await request<StoredSnapshot[]>(store.getAll());
        let size = rows.reduce((sum, row) => sum + row.bytes, 0);
        for (const row of rows.sort((left, right) => left.accessedAt - right.accessedAt)) {
          if (size > this.limits.diskBytes || this.expired(row)) {
            store.delete(row.id);
            size -= row.bytes;
          }
        }
        await done;
      })
      .catch(() => {});
  }

  clear(): void {
    this.generation++;
    this.memory.clear();
    this.writes = this.writes
      .then(async () => {
        const database = await this.open();
        if (!database) return;
        const transaction = database.transaction('snapshots', 'readwrite');
        const done = completed(transaction);
        transaction.objectStore('snapshots').clear();
        await done;
      })
      .catch(() => {});
  }

  /** Resolves after queued writes, useful for checking persistence without reloading the widget. */
  async settled(): Promise<void> {
    await this.writes;
  }

  /** Releases tab-local resources without deleting snapshots intended for a later widget visit. */
  close(): void {
    this.generation++;
    this.memory.clear();
    void this.writes.then(async () => (await this.database)?.close()).catch(() => {});
  }

  private remember(snapshot: ProjectSnapshot): void {
    this.memory.delete(snapshot.id);
    if (snapshot.bytes <= this.limits.memoryBytes) this.memory.set(snapshot.id, snapshot);
    let bytes = [...this.memory.values()].reduce((sum, item) => sum + item.bytes, 0);
    while (this.memory.size > this.limits.memoryProjects || bytes > this.limits.memoryBytes) {
      const oldest = this.memory.values().next().value;
      if (!oldest) break;
      this.memory.delete(oldest.id);
      bytes -= oldest.bytes;
    }
  }

  private expired(snapshot: ProjectSnapshot): boolean {
    const fetchedAt = Math.max(snapshot.projectFetchedAt ?? 0, snapshot.bomFetchedAt ?? 0);
    return Date.now() - (fetchedAt || snapshot.accessedAt) > this.limits.maxAgeMs;
  }

  private open(): Promise<IDBDatabase | undefined> {
    if (!this.persistent || typeof indexedDB === 'undefined') return Promise.resolve(undefined);
    this.database ??= new Promise((resolve) => {
      let settled = false;
      const finish = (database?: IDBDatabase) => {
        if (settled) {
          database?.close();
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(database);
      };
      // A blocked storage connection must not hold up network loading or the editor.
      const timeout = setTimeout(() => finish(), 2000);
      try {
        const open = indexedDB.open(`project-widget-records-v1:${this.scope}`, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('snapshots', { keyPath: 'id' });
        open.onsuccess = () => {
          const database = open.result;
          database.onversionchange = () => database.close();
          finish(database);
        };
        open.onerror = () => finish();
        open.onblocked = () => finish();
      } catch {
        finish();
      }
    });
    return this.database;
  }
}
