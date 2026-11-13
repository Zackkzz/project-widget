import { ExpiringReadCache } from './expiringReadCache';
import { hydrateMissingFields } from '../services/subformHydration';
import type { SubformReadContext } from './types/subform-read-cache.types';

/** Normalise object keys so equivalent project responses share the same enrichment cache entry. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/** Caches only missing-field responses; fresh project values always remain authoritative. */
export class SubformReadCache {
  private readonly entries = new ExpiringReadCache<Record<string, unknown>>(64, structuredClone);

  hydrate(
    row: Record<string, unknown>,
    fields: string[],
    fetchFields: (id: string, fields: string[]) => Promise<Record<string, unknown>>,
    context: SubformReadContext = {},
  ): Promise<Record<string, unknown>> {
    return hydrateMissingFields(row, fields, (id, missing) => {
      const key = JSON.stringify([
        context.projectId,
        context.report,
        context.revision,
        canonical(row),
        [...missing].sort(),
      ]);
      const load = async () => {
        const result = await fetchFields(id, missing);
        if (result.ID !== undefined && result.ID !== id)
          throw new Error('Zoho returned a different subform record.');
        // Never retain unrelated report data or file contents in this metadata cache.
        return Object.fromEntries(
          ['ID', ...missing]
            .filter((field) => Object.hasOwn(result, field))
            .map((field) => [field, result[field]]),
        );
      };
      if (new TextEncoder().encode(key).byteLength > 8 * 1024) return load();
      return this.entries.read(
        key,
        30_000,
        load,
        (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 32 * 1024,
      );
    });
  }

  clear(): void {
    this.entries.clear();
  }
}
