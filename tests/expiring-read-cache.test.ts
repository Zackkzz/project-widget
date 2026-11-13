import { describe, expect, it, vi } from 'vitest';
import {
  ExpiringReadCache,
  referenceReadTtl,
  cacheableReferenceResponse,
} from '../app/src/cache/expiringReadCache';

describe('bounded session read caches', () => {
  it('expires resolved values and never retains failed reads', async () => {
    let now = 100;
    const time = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const cache = new ExpiringReadCache<number>();
    const load = vi.fn(async () => 5);
    try {
      await cache.read('a', 30, load);
      now = 129;
      await cache.read('a', 30, load);
      expect(load).toHaveBeenCalledTimes(1);
      now = 130;
      await cache.read('a', 30, load);
      expect(load).toHaveBeenCalledTimes(2);
      const fail = vi.fn(async (): Promise<number> => {
        throw new Error('denied');
      });
      await expect(cache.read('bad', 30, fail)).rejects.toThrow('denied');
      await expect(cache.read('bad', 30, fail)).rejects.toThrow('denied');
      expect(fail).toHaveBeenCalledTimes(2);
    } finally {
      time.mockRestore();
    }
  });

  it('clears pending entries without allowing late results to repopulate the cache', async () => {
    const cache = new ExpiringReadCache<number>();
    let release!: (value: number) => void;
    const first = cache.read(
      'a',
      30000,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    cache.clear();
    release(1);
    await first;
    const load = vi.fn(async () => 2);
    expect(await cache.read('a', 30000, load)).toBe(2);
    expect(load).toHaveBeenCalledOnce();
  });

  it('bounds entry count and isolates mutable reference response values', async () => {
    const cache = new ExpiringReadCache<{ value: number }>(1, structuredClone);
    const load = vi.fn(async () => ({ value: 1 }));
    const first = await cache.read('a', 30000, load);
    first.value = 5;
    expect((await cache.read('a', 30000, load)).value).toBe(1);
    await cache.read('b', 30000, load);
    await cache.read('a', 30000, load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('caches only selected country and permission reads, not project baselines or report searches', () => {
    expect(
      referenceReadTtl({
        report_name: 'Countries',
        fields: 'Country_Name,Country_Code,States',
        criteria: 'ID == 1',
      }),
    ).toBe(300000);
    expect(
      referenceReadTtl({
        report_name: 'Staff_List',
        fields: 'Permissions',
        criteria: 'User_name == "one"',
      }),
    ).toBe(30000);
    expect(referenceReadTtl({ report_name: 'Project_Report', criteria: 'ID == 1' })).toBe(0);
    expect(
      referenceReadTtl({
        report_name: 'Staff_List',
        fields: 'Staff_name',
        criteria: 'User_name == "one"',
      }),
    ).toBe(0);
    expect(
      referenceReadTtl({ report_name: 'Countries', fields: 'Country_Name,Country_Code,States' }),
    ).toBe(0);
    expect(
      cacheableReferenceResponse({ responseText: JSON.stringify({ code: 3000, data: [] }) }),
    ).toBe(true);
    expect(cacheableReferenceResponse({ code: 3100, message: 'Permission denied' })).toBe(false);
    expect(cacheableReferenceResponse({ code: 9270 })).toBe(false);
    expect(cacheableReferenceResponse({ responseText: 'not JSON' })).toBe(false);
  });
});
