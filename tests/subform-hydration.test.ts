import { describe, expect, it, vi } from 'vitest';
import { hydrateMissingFields } from '../app/src/services/subformHydration';

describe('project-first subform hydration', () => {
  it('does not fetch complete rows, including blank and null values', async () => {
    const row = { ID: '1', Subject: '', Staff: [], Signature: null };
    const fetch = vi.fn();
    expect(await hydrateMissingFields(row, ['Subject', 'Staff', 'Signature'], fetch)).toBe(row);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests only missing fields and does not overwrite project values or add unrelated fields', async () => {
    const row = { ID: '1', Subject: 'Project value', Files: undefined };
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ID: '1',
        Subject: 'Other value',
        Files: ['a.png'],
        Staff: [],
        Extra: 5,
      });
    expect(await hydrateMissingFields(row, ['Subject', 'Files', 'Staff', 'Staff'], fetch)).toEqual({
      ID: '1',
      Subject: 'Project value',
      Files: ['a.png'],
      Staff: [],
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('1', ['Files', 'Staff']);
    expect(row.Files).toBeUndefined();
  });

  it('preserves unavailable fields as missing rather than inventing empty values', async () => {
    expect(await hydrateMissingFields({ ID: '1' }, ['Files'], async () => ({ ID: '1' }))).toEqual({
      ID: '1',
    });
  });

  it('does not fetch unsaved rows and rejects a response for a different record', async () => {
    const fetch = vi.fn();
    await hydrateMissingFields({}, ['Subject'], fetch);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      hydrateMissingFields({ ID: '1' }, ['Subject'], async () => ({ ID: '2' })),
    ).rejects.toThrow('different subform');
  });
});
