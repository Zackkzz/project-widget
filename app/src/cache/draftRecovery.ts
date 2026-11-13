import type { DraftConflict, EditorDraft, EditorRow } from './types/draft-recovery.types';

/** Compares field values independently of object property order. */
function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (left instanceof Blob || right instanceof Blob) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        equal((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
}

/** Reapplies local changes to a fresh baseline, requiring a choice for overlapping changes. */
export function mergeEditorDraft(
  base: EditorDraft,
  draft: EditorDraft,
  latest: EditorDraft,
  choices: Record<string, 'mine' | 'latest'> = {},
): { draft: EditorDraft; conflicts: DraftConflict[]; automaticCount: number } {
  const conflicts: DraftConflict[] = [];
  let automaticCount = 0;
  function value(before: unknown, mine: unknown, server: unknown, path: string[]): unknown {
    if (equal(before, mine)) {
      if (!equal(before, server)) automaticCount++;
      return server;
    }
    if (equal(before, server) || equal(mine, server)) {
      automaticCount++;
      return mine;
    }
    const key = JSON.stringify(path);
    if (!choices[key]) conflicts.push({ key, path, mine, latest: server, before });
    return choices[key] === 'latest' ? server : mine;
  }
  function values(
    before: Record<string, unknown>,
    mine: Record<string, unknown>,
    server: Record<string, unknown>,
    path: string[],
  ) {
    const result = { ...server };
    for (const name of Object.keys(mine)) {
      // A field no longer exposed by the report must not be resubmitted from a stale draft.
      if (!Object.hasOwn(server, name)) {
        if (!equal(before[name], mine[name])) {
          const missingPath = [...path, name];
          const key = JSON.stringify(missingPath);
          if (!choices[key])
            conflicts.push({
              key,
              path: missingPath,
              mine: mine[name],
              latest: undefined,
              before: before[name],
              deleted: true,
            });
        }
        continue;
      }
      result[name] = value(before[name], mine[name], server[name], [...path, name]);
    }
    return result;
  }
  const result: EditorDraft = {
    values: values(base.values, draft.values, latest.values, ['values']),
    sections: { ...latest.sections },
  };
  for (const [section, mineRows] of Object.entries(draft.sections)) {
    const beforeRows = base.sections[section] ?? [];
    const serverRows = latest.sections[section];
    if (!serverRows) {
      if (!equal(beforeRows, mineRows)) {
        const path = ['sections', section];
        const key = JSON.stringify(path);
        if (!choices[key])
          conflicts.push({
            key,
            path,
            mine: mineRows,
            latest: undefined,
            before: beforeRows,
            deleted: true,
          });
      }
      continue;
    }
    const identity = (row: EditorRow) => row.id || row.key;
    const merged = serverRows.map((server) => {
      const mine = mineRows.find((row) => identity(row) === identity(server));
      const before = beforeRows.find((row) => identity(row) === identity(server));
      if (!mine || !before) return server;
      return {
        ...server,
        key: mine.key,
        values: values(before.values, mine.values, server.values, [
          'sections',
          section,
          identity(mine),
          'values',
        ]),
        ...(mine.files?.length ? { files: mine.files } : {}),
      };
    });
    for (const mine of mineRows) {
      const before = beforeRows.find((row) => identity(row) === identity(mine));
      if (!before) {
        merged.push(mine);
        continue;
      }
      if (serverRows.some((row) => identity(row) === identity(mine))) continue;
      if (equal(before.values, mine.values) && !mine.files?.length) continue;
      const path = ['sections', section, identity(mine)];
      const key = JSON.stringify(path);
      if (!choices[key])
        conflicts.push({
          key,
          path,
          mine: mine.values,
          latest: undefined,
          before: before.values,
          deleted: true,
        });
      // Deleted server records cannot be silently recreated; preserve the draft for review.
      if (choices[key] !== 'latest') merged.push(mine);
    }
    result.sections[section] = merged;
  }
  return { draft: result, conflicts, automaticCount };
}

export function recoveryValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Empty';
  if (Array.isArray(value)) return value.map(recoveryValue).join(', ') || 'Empty';
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return String(item.label ?? item.zc_display_value ?? item.name ?? 'Changed row');
  }
  return String(value);
}
