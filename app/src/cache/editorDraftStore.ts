import type { SavedEditorDraft } from './types/draft-recovery.types';

const maxAge = 24 * 60 * 60 * 1000;

/** Keeps unsaved fields in this tab, with IndexedDB retaining selected files across refreshes. */
export class EditorDraftStore {
  private memory = new Map<string, SavedEditorDraft>();
  private pending = Promise.resolve();
  private database?: Promise<IDBDatabase | undefined>;
  private lastStamp = 0;
  private readonly prefix: string;

  private readonly scope: string;

  constructor(identity: string) {
    let tab: string = crypto.randomUUID();
    try {
      const key = `project-widget-draft-tab:${identity}`;
      tab = sessionStorage.getItem(key) || tab;
      sessionStorage.setItem(key, tab);
    } catch {
      // Isolate this instance when browser storage cannot provide a stable tab identity.
    }
    this.scope = `${identity}:${tab}`;
    this.prefix = `project-widget-draft:${this.scope}:`;
  }

  async save(value: Omit<SavedEditorDraft, 'savedAt'>): Promise<boolean> {
    const saved: SavedEditorDraft = { ...value, savedAt: Math.max(Date.now(), this.lastStamp + 1) };
    this.lastStamp = saved.savedAt;
    // Only the active editor needs a tab-local copy; older drafts remain in storage.
    this.memory.clear();
    this.memory.set(value.id, saved);
    let sessionSaved = false;
    let hasFiles = false;
    let attachmentBytes = 0;
    try {
      const text = JSON.stringify(saved, (_key, item) => {
        if (item instanceof Blob) {
          hasFiles = true;
          attachmentBytes += item.size;
          return { missingDraftFile: true, name: item instanceof File ? item.name : 'Attachment' };
        }
        return item;
      });
      saved.bytes = new TextEncoder().encode(text).byteLength + attachmentBytes;
      if (text.length > 1024 * 1024) throw new Error('Draft is too large for session storage.');
      sessionStorage.setItem(this.prefix + value.id, text);
      sessionStorage.setItem(this.prefix + 'last', value.id);
      sessionSaved = true;
    } catch {
      /* Full or disabled storage must leave the in-memory draft intact. */
    }
    let diskSaved = false;
    this.pending = this.pending
      .then(async () => {
        const database = await this.open();
        if (!database || this.memory.get(value.id)?.savedAt !== saved.savedAt) return;
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('drafts', 'readwrite');
          const store = transaction.objectStore('drafts');
          let total = saved.bytes ?? 0;
          let count = 1;
          const expired = store
            .index('savedAt')
            .openKeyCursor(IDBKeyRange.upperBound(Date.now() - maxAge));
          expired.onsuccess = () => {
            const entry = expired.result;
            if (entry) {
              store.delete(entry.primaryKey);
              entry.continue();
              return;
            }
            const cursor = store.index('bytes').openKeyCursor();
            cursor.onsuccess = () => {
              const row = cursor.result;
              if (row) {
                if (row.primaryKey !== saved.id) {
                  total += Number(row.key);
                  count++;
                }
                row.continue();
              } else if (total <= 25 * 1024 * 1024 && count <= 5) store.put(saved);
              else transaction.abort();
            };
          };
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        diskSaved = true;
      })
      .catch(() => {});
    await this.pending;
    if (diskSaved) {
      try {
        sessionStorage.setItem(this.prefix + 'last', value.id);
      } catch {
        /* Current editor can still recover in memory. */
      }
    }
    return diskSaved || (sessionSaved && !hasFiles);
  }

  async load(id: string): Promise<SavedEditorDraft | undefined> {
    let saved = this.memory.get(id);
    try {
      const text = sessionStorage.getItem(this.prefix + id);
      if (text) {
        const session = JSON.parse(text) as SavedEditorDraft;
        if (!saved || session.savedAt > saved.savedAt) saved = session;
      }
      const database = await this.open();
      if (database) {
        const disk = await new Promise<SavedEditorDraft | undefined>((resolve, reject) => {
          const request = database.transaction('drafts').objectStore('drafts').get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (disk && (!saved || disk.savedAt >= saved.savedAt)) saved = disk;
      }
    } catch {
      /* Restore the session backup if persistent storage is unavailable. */
    }
    if (!saved || saved.id !== id || Date.now() - saved.savedAt > maxAge) return;
    const restored = structuredClone(saved);
    for (const draft of [restored.draft, restored.recovery?.draft].filter(Boolean))
      for (const rows of Object.values(draft!.sections))
        for (const row of rows) {
          if (row.files?.some((file) => !(file instanceof File))) {
            row.files = row.files.filter((file) => file instanceof File);
            restored.missingFiles = true;
          }
        }
    return restored;
  }

  async latest(): Promise<SavedEditorDraft | undefined> {
    try {
      const id = sessionStorage.getItem(this.prefix + 'last');
      return id ? this.load(id) : undefined;
    } catch {
      return;
    }
  }

  async clear(id: string): Promise<void> {
    this.memory.delete(id);
    try {
      sessionStorage.removeItem(this.prefix + id);
      if (sessionStorage.getItem(this.prefix + 'last') === id)
        sessionStorage.removeItem(this.prefix + 'last');
    } catch {
      /* Storage may be disabled in an embedded browser. */
    }
    this.pending = this.pending
      .then(async () => {
        const database = await this.open();
        if (!database) return;
        await new Promise<void>((resolve) => {
          const transaction = database.transaction('drafts', 'readwrite');
          transaction.objectStore('drafts').delete(id);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
          transaction.onabort = () => resolve();
        });
      })
      .catch(() => {});
    await this.pending;
  }

  private open(): Promise<IDBDatabase | undefined> {
    this.database ??= new Promise((resolve) => {
      let finished = false;
      const timeout = setTimeout(() => finish(), 1500);
      function finish(database?: IDBDatabase) {
        if (finished) {
          database?.close();
          return;
        }
        finished = true;
        clearTimeout(timeout);
        resolve(database);
      }
      try {
        const request = indexedDB.open(`project-widget-drafts-v1:${this.scope}`, 3);
        request.onupgradeneeded = () => {
          const store = request.result.objectStoreNames.contains('drafts')
            ? request.transaction!.objectStore('drafts')
            : request.result.createObjectStore('drafts', { keyPath: 'id' });
          if (!store.indexNames.contains('bytes')) store.createIndex('bytes', 'bytes');
          if (!store.indexNames.contains('savedAt')) store.createIndex('savedAt', 'savedAt');
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          finish(request.result);
        };
        request.onerror = () => finish();
        request.onblocked = () => finish();
      } catch {
        finish();
      }
    });
    return this.database;
  }
}
