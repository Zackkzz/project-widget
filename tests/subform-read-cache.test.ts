import { describe, expect, it, vi } from 'vitest';
import { SubformReadCache } from '../app/src/cache/subformReadCache';

describe('missing subform field and file metadata cache', () => {
  it('shares enrichment for unchanged project rows while preserving new project values', async () => {
    const cache = new SubformReadCache();
    const fetch = vi.fn(async () => ({
      ID: '2',
      Files: ['file.png'],
      Description: 'filled',
      Unrelated: 'omit',
    }));
    const context = { projectId: '1', report: 'Issue_Registers' };
    const first = await cache.hydrate(
      { ID: '2', Subject: 'same' },
      ['Files', 'Description'],
      fetch,
      context,
    );
    first.Files = [];
    const second = await cache.hydrate(
      { Subject: 'same', ID: '2' },
      ['Description', 'Files'],
      fetch,
      context,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual({
      ID: '2',
      Subject: 'same',
      Files: ['file.png'],
      Description: 'filled',
    });
    const changed = await cache.hydrate(
      { ID: '2', Subject: 'changed', Description: '' },
      ['Files', 'Description'],
      fetch,
      context,
    );
    expect(changed.Description).toBe('');
    expect(fetch).toHaveBeenLastCalledWith('2', ['Files']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refetches after project revision changes, cache expiry and invalidation', async () => {
    let now = 100;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const cache = new SubformReadCache();
    const fetch = vi.fn(async () => ({ ID: '2', File_upload: [] }));
    const row = { ID: '2' };
    try {
      await cache.hydrate(row, ['File_upload'], fetch, { projectId: '1', revision: 'a' });
      await cache.hydrate(row, ['File_upload'], fetch, { projectId: '1', revision: 'b' });
      now += 30000;
      await cache.hydrate(row, ['File_upload'], fetch, { projectId: '1', revision: 'b' });
      cache.clear();
      await cache.hydrate(row, ['File_upload'], fetch, { projectId: '1', revision: 'b' });
      expect(fetch).toHaveBeenCalledTimes(4);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not cache failures or mix projects, reports or widget sessions', async () => {
    const cache = new SubformReadCache();
    const fetch = vi.fn(async () => ({ ID: '2', Files: [] }));
    await cache.hydrate({ ID: '2' }, ['Files'], fetch, { projectId: '1', report: 'a' });
    await cache.hydrate({ ID: '2' }, ['Files'], fetch, { projectId: '3', report: 'a' });
    await cache.hydrate({ ID: '2' }, ['Files'], fetch, { projectId: '1', report: 'b' });
    await new SubformReadCache().hydrate({ ID: '2' }, ['Files'], fetch, {
      projectId: '1',
      report: 'a',
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    const fail = vi.fn(async () => {
      throw new Error('permission denied');
    });
    await expect(cache.hydrate({ ID: '2' }, ['Files'], fail)).rejects.toThrow('permission denied');
    await expect(cache.hydrate({ ID: '2' }, ['Files'], fail)).rejects.toThrow('permission denied');
    expect(fail).toHaveBeenCalledTimes(2);
  });

  it('does not retain oversized metadata or mismatched records', async () => {
    const cache = new SubformReadCache();
    const large = vi.fn(async () => ({ ID: '2', Description: 'x'.repeat(33000) }));
    await cache.hydrate({ ID: '2' }, ['Description'], large);
    await cache.hydrate({ ID: '2' }, ['Description'], large);
    expect(large).toHaveBeenCalledTimes(2);
    const wrong = vi.fn(async () => ({ ID: '3', Files: [] }));
    await expect(cache.hydrate({ ID: '2' }, ['Files'], wrong)).rejects.toThrow('different subform');
    await expect(cache.hydrate({ ID: '2' }, ['Files'], wrong)).rejects.toThrow('different subform');
    expect(wrong).toHaveBeenCalledTimes(2);
  });
});
