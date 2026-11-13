/** Small in-memory cache that shares pending reads and evicts failures immediately. */
export class ExpiringReadCache<T> {
  private readonly entries = new Map<string, { promise: Promise<T>; expires: number }>();

  constructor(
    private readonly maximumEntries = 32,
    private readonly copy: (value: T) => T = (value) => value,
  ) {}

  read(key: string, ttl: number, load: () => Promise<T>, accept = (_value: T) => true): Promise<T> {
    const previous = this.entries.get(key);
    if (previous && previous.expires > Date.now()) return previous.promise.then(this.copy);
    this.entries.delete(key);
    const entry = { promise: Promise.resolve().then(load), expires: Infinity };
    this.entries.set(key, entry);
    while (this.entries.size > this.maximumEntries)
      this.entries.delete(this.entries.keys().next().value!);
    void entry.promise.then(
      (value) => {
        if (this.entries.get(key) !== entry) return;
        if (accept(value)) entry.expires = Date.now() + ttl;
        else this.entries.delete(key);
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return entry.promise.then(this.copy);
  }

  /** Invalidates pending results as well as resolved values without interrupting their callers. */
  clear(): void {
    this.entries.clear();
  }
}

/** Only country detail reads and user-specific Project permission reads qualify for reuse. */
export function referenceReadTtl(config: unknown): number {
  if (!config || typeof config !== 'object') return 0;
  const request = config as Record<string, unknown>;
  if (typeof request.criteria !== 'string' || !request.criteria.trim() || request.record_cursor)
    return 0;
  if (request.report_name === 'Countries' && request.fields === 'Country_Name,Country_Code,States')
    return 5 * 60_000;
  if (request.report_name === 'Staff_List' && request.fields === 'Permissions') return 30_000;
  return 0;
}

/** Cache successful responses and recognised empty results, never permission or network errors. */
export function cacheableReferenceResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  let response = value as Record<string, unknown>;
  if (response.responseText) {
    try {
      response =
        typeof response.responseText === 'string'
          ? JSON.parse(response.responseText)
          : (response.responseText as Record<string, unknown>);
    } catch {
      return false;
    }
  }
  return !!response && [3000, 9220, 9280].includes(Number(response.code));
}
