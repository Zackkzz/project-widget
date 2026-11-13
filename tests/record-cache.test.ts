import { describe, expect, it, vi } from 'vitest';
import { RequestScheduler } from '../app/src/cache/requestScheduler';
import { SnapshotStore } from '../app/src/cache/snapshotStore';

describe('bounded project snapshots', () => {
  it('checks editor freshness without copying records or promoting their eviction order', () => {
    const store = new SnapshotStore('freshness', false, { memoryProjects: 2 });
    const now = Date.now();
    store.put('1', {
      record: { id: '1', raw: {} },
      bom: [],
      projectFetchedAt: now,
      bomFetchedAt: now,
    });
    store.put('2', { record: { id: '2', raw: {} }, projectFetchedAt: now });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(store.hasFreshEditor('1')).toBe(true);
    expect(store.hasFreshEditor('2')).toBe(false);
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    store.put('3', { record: { id: '3', raw: {} } });
    expect(store.hasFreshEditor('1')).toBe(false);
    store.put('4', {
      record: { id: '4', raw: {} },
      bom: [],
      projectFetchedAt: now,
      bomFetchedAt: now - 60_000,
    });
    expect(store.hasFreshEditor('4')).toBe(false);
  });

  it('evicts the least recently used project and never exposes mutable cached values', () => {
    const store = new SnapshotStore('user-a', false, { memoryProjects: 2 });
    const record = { id: '1', raw: { Notes: 'original' } };
    store.put('1', { record });
    record.raw.Notes = 'mutated outside';
    store.put('2', { record: { id: '2', raw: {} } });
    const first = store.peek('1')!;
    first.record!.raw.Notes = 'mutated draft';
    store.put('3', { record: { id: '3', raw: {} } });
    expect(store.peek('2')).toBeUndefined();
    expect(store.peek('1')?.record?.raw.Notes).toBe('original');
  });

  it('enforces the byte limit and expires old data even when recently accessed', () => {
    const store = new SnapshotStore('user-a', false, { memoryBytes: 800, maxAgeMs: 1000 });
    store.put('1', { record: { id: '1', raw: { Notes: 'x'.repeat(1000) } } });
    expect(store.peek('1')).toBeUndefined();
    store.put('2', { record: { id: '2', raw: {} }, projectFetchedAt: Date.now() - 2000 });
    expect(store.peek('2')).toBeUndefined();
  });

  it('continues to work in memory when persistent storage is unavailable', async () => {
    const store = new SnapshotStore('user-a', true);
    store.put('1', { record: { id: '1', raw: { Notes: 'cached' } } });
    await store.settled();
    expect((await store.read('1'))?.record?.raw.Notes).toBe('cached');
    store.clear();
    expect(await store.read('1')).toBeUndefined();
  });
});

describe('record request scheduling', () => {
  it('deduplicates reads and prioritizes foreground work over queued prefetch', async () => {
    const scheduler = new RequestScheduler(1);
    const order: string[] = [];
    let release!: () => void;
    const slow = vi.fn(() => new Promise<string>((resolve) => (release = () => resolve('first'))));
    const first = scheduler.read('first', 1, slow);
    const duplicate = scheduler.read('first', 0, slow);
    expect(first).toBe(duplicate);
    const background = scheduler.read('background', 1, async () => order.push('background'));
    const foreground = scheduler.read('foreground', 0, async () => order.push('foreground'));
    await Promise.resolve();
    release();
    await Promise.all([first, duplicate, background, foreground]);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['foreground', 'background']);
  });

  it('limits concurrent reads and releases slots after errors', async () => {
    const scheduler = new RequestScheduler(4);
    let active = 0;
    let maximum = 0;
    const reads = Array.from({ length: 12 }, (_, index) =>
      scheduler.read(String(index), 0, async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
        if (index === 0) throw new Error('permission denied');
      }),
    );
    await Promise.allSettled(reads);
    expect(maximum).toBe(4);
    await expect(scheduler.read('recovery', 0, async () => 'ok')).resolves.toBe('ok');
  });
});
