import { describe, expect, it, vi } from 'vitest';
import { createProjectCacheRuntime } from '../app/src/cache/projectCache';

function records() {
  return {
    list: async () => ({ records: [] }),
    get: async (id: string) => ({ id, raw: {} }),
    bom: async () => ({ records: [] }),
    getBom: async (id: string) => ({ id, raw: {} }),
    updateMilestone: vi.fn(async () => {}),
    readMilestoneSignature: vi.fn(
      async (projectId: string, milestoneId: string) =>
        new Blob([projectId, milestoneId], { type: 'image/png' }),
    ),
  };
}

describe('Edit Project repeated reads', () => {
  it('keeps the signature-loader reference stable and shares repeated image downloads', async () => {
    const runtime = createProjectCacheRuntime({ DATA: {} }, { app: 'signature-test' }, []);
    const source = records();
    const cached = runtime.attach(source, source);
    try {
      expect(cached.readMilestoneSignature).toBe(cached.readMilestoneSignature);
      const read = cached.readMilestoneSignature as typeof source.readMilestoneSignature;
      await Promise.all([read('1', '2'), read('1', '2')]);
      await read('1', '2');
      expect(source.readMilestoneSignature).toHaveBeenCalledTimes(1);
      if (typeof cached.updateMilestone !== 'function') throw new Error('Missing milestone update');
      await cached.updateMilestone();
      await read('1', '2');
      expect(source.readMilestoneSignature).toHaveBeenCalledTimes(2);
    } finally {
      cached.disposeCache();
    }
  });

  it('reloads image content when a fresh project response has a different signature', async () => {
    let version = 'old.png';
    const runtime = createProjectCacheRuntime({ DATA: {} }, { app: 'signature-refresh' }, []);
    const source = {
      ...records(),
      get: async (id: string) => ({
        id,
        raw: { Milestone_Tracker: [{ ID: '2', Signature: version }] },
      }),
    };
    const cached = runtime.attach(source, source);
    try {
      await cached.getFresh('1');
      if (typeof cached.readMilestoneSignature !== 'function')
        throw new Error('Missing signature reader');
      await cached.readMilestoneSignature('1', '2');
      version = 'new.png';
      await cached.getFresh('1');
      await cached.readMilestoneSignature('1', '2');
      expect(source.readMilestoneSignature).toHaveBeenCalledTimes(2);
    } finally {
      cached.disposeCache();
    }
  });

  it('reuses country details and project permissions across foreground and prefetch', async () => {
    const getRecords = vi.fn(async () => ({ code: 3000, data: [{ ID: '1' }] }));
    const runtime = createProjectCacheRuntime(
      { DATA: { getRecords } },
      { app: 'reference-test', user: 'one' },
      [],
    );
    const country = {
      report_name: 'Countries',
      field_config: 'custom',
      fields: 'Country_Name,Country_Code,States',
      criteria: 'ID == 1',
      max_records: 200,
    };
    const permission = {
      report_name: 'Staff_List',
      field_config: 'custom',
      fields: 'Permissions',
      criteria: 'User_name == "one"',
      max_records: 200,
    };
    const foreground = runtime.sdk.DATA.getRecords as (config: typeof country) => Promise<unknown>;
    const background = runtime.backgroundSdk.DATA.getRecords as typeof foreground;
    await background(country);
    await new Promise((resolve) => setTimeout(resolve, 1));
    await foreground(country);
    await foreground(permission);
    await new Promise((resolve) => setTimeout(resolve, 1));
    await foreground(permission);
    expect(getRecords).toHaveBeenCalledTimes(2);
  });
});
