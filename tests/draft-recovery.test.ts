import { describe, expect, it } from 'vitest';
import { mergeEditorDraft } from '../app/src/cache/draftRecovery';
import { EditorDraftStore } from '../app/src/cache/editorDraftStore';
import type { EditorDraft } from '../app/src/cache/types/draft-recovery.types';

const draft = (values: Record<string, unknown>): EditorDraft => ({ values, sections: {} });

describe('editor draft recovery', () => {
  it('combines local changes and unrelated server changes without mutating either input', () => {
    const base = draft({ name: 'Original', notes: 'Old', quantity: 0 });
    const mine = draft({ name: 'My name', notes: 'Old', quantity: 0 });
    const server = draft({ name: 'Original', notes: 'Server notes', quantity: 0 });
    const merged = mergeEditorDraft(base, mine, server);
    expect(merged.draft.values).toEqual({ name: 'My name', notes: 'Server notes', quantity: 0 });
    expect(merged.conflicts).toEqual([]);
    expect(merged.automaticCount).toBe(2);
    expect(mine.values.notes).toBe('Old');
    expect(server.values.name).toBe('Original');
  });

  it('requires an explicit choice for overlapping changes, including clear values', () => {
    const base = draft({ notes: 'Original' });
    const mine = draft({ notes: '' });
    const server = draft({ notes: 'Updated' });
    const merged = mergeEditorDraft(base, mine, server);
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.conflicts[0].before).toBe('Original');
    const key = merged.conflicts[0].key;
    expect(mergeEditorDraft(base, mine, server, { [key]: 'mine' }).draft.values.notes).toBe('');
    expect(mergeEditorDraft(base, mine, server, { [key]: 'latest' }).draft.values.notes).toBe(
      'Updated',
    );
  });

  it('matches subform rows by identity, preserves additions/files, and refreshes row originals', () => {
    const file = new File(['attachment'], 'issue.txt');
    const row = {
      key: 'a',
      id: 'a',
      original: { Quantity: '1' },
      values: { quantity: '1', notes: '' },
    };
    const base: EditorDraft = { values: {}, sections: { BOM: [row] } };
    const mine: EditorDraft = {
      values: {},
      sections: {
        BOM: [
          { ...row, values: { quantity: '2', notes: '' }, files: [file] },
          { key: 'new', original: {}, values: { quantity: '3' } },
        ],
      },
    };
    const server: EditorDraft = {
      values: {},
      sections: {
        BOM: [
          {
            ...row,
            key: 'server-a',
            original: { Quantity: '1', Notes: 'Latest' },
            values: { quantity: '1', notes: 'Latest' },
          },
          { key: 'b', id: 'b', original: {}, values: { quantity: '4' } },
        ],
      },
    };
    const merged = mergeEditorDraft(base, mine, server);
    expect(merged.conflicts).toEqual([]);
    expect(merged.draft.sections.BOM.map((item) => item.key)).toEqual(['a', 'b', 'new']);
    expect(merged.draft.sections.BOM[0].values).toEqual({ quantity: '2', notes: 'Latest' });
    expect(merged.draft.sections.BOM[0].original).toEqual(server.sections.BOM[0].original);
    expect(merged.draft.sections.BOM[0].files).toEqual([file]);
  });

  it('keeps removed-field and deleted-row edits for explicit review rather than silently recreating them', () => {
    const base: EditorDraft = {
      values: { hidden: 'Old' },
      sections: { PO: [{ key: '1', id: '1', original: {}, values: { name: 'Old' } }] },
    };
    const mine: EditorDraft = {
      values: { hidden: 'Mine' },
      sections: { PO: [{ key: '1', id: '1', original: {}, values: { name: 'Mine' } }] },
    };
    const server: EditorDraft = { values: {}, sections: { PO: [] } };
    const merged = mergeEditorDraft(base, mine, server);
    expect(merged.conflicts).toHaveLength(2);
    expect(merged.conflicts.every((item) => item.deleted)).toBe(true);
    expect(merged.conflicts[0].mine).toBe('Mine');
    const choices = Object.fromEntries(
      merged.conflicts.map((item) => [item.key, 'latest' as const]),
    );
    const accepted = mergeEditorDraft(base, mine, server, choices);
    expect(accepted.conflicts).toEqual([]);
    expect(accepted.draft).toEqual(server);
  });

  it('restores fields from session storage and clears the draft only when requested', async () => {
    const store = new EditorDraftStore('draft-test');
    const data = {
      id: 'one',
      isBom: false,
      base: draft({ notes: 'Old' }),
      draft: draft({ notes: 'Mine' }),
    };
    expect(await store.save(data)).toBe(true);
    const reopened = new EditorDraftStore('draft-test');
    expect((await reopened.latest())?.draft.values.notes).toBe('Mine');
    expect(await new EditorDraftStore('another-user').latest()).toBeUndefined();
    await reopened.clear('one');
    expect(await reopened.load('one')).toBeUndefined();
  });
});
