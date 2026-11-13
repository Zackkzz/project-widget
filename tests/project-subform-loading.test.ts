import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { patchRecordCache } from '../scripts/patch-record-cache.mjs';
import { hydrateMissingFields } from '../app/src/services/subformHydration';
import { SubformReadCache } from '../app/src/cache/subformReadCache';
import { mapConcurrent, createProjectCacheRuntime } from '../app/src/cache/projectCache';

/** Exercise the actual preserved gateway after applying the same patch used by packaging. */
function gateway(
  project: Record<string, unknown>,
  permission?: (fresh: boolean) => Promise<boolean>,
  fileName = () => 'attachment.png',
) {
  const bundle = patchRecordCache(readFileSync('dist/app/assets/widget-DwtEDLVK.js', 'utf8'));
  const start = bundle.indexOf('function qS(');
  const end = bundle.indexOf('const Bl=', start);
  const getRecordById = vi.fn(
    async (config: { report_name: string; id: string; fields?: string }) => ({
      code: 3000,
      data:
        config.report_name === 'Project_Report'
          ? structuredClone(project)
          : {
              ID: config.id,
              Staff: [],
              Files: [fileName()],
              Signature: '/signature/download',
              File_upload: [],
              Subject: 'Must not overwrite project',
            },
    }),
  );
  const create = new Function(
    'hydrateMissingFields',
    'mapConcurrent',
    `
    const La='Project_Report',Yr='Milestones',Po='BOM_Record';
    const ef=[{name:'Project_ID'},{name:'Project_Name'}];
    const $e=JSON.stringify;
    const US={Software_Iteration:'Software_Iteration_Report'};
    const pt=[{name:'PO',fields:[{name:'Subject'}]},{name:'Issue_Register',fields:[{name:'Subject'},{name:'Staff'},{name:'Files'}]},{name:'Software_Iteration',fields:[{name:'Subject'}]}];
    const ns=[{name:'Signature'},{name:'File_upload'}];
    const _e=value=>value&&typeof value==='object'?value:{};
    const ot=value=>String(value),Bt=value=>value,jt=value=>value,we=value=>value.message;
    const ue=Error;
    ${bundle.slice(start, end)}
    return qS;
  `,
  )(hydrateMissingFields, mapConcurrent);
  const cache = new SubformReadCache();
  return {
    records: create(
      {
        DATA: { getRecordById, updateRecordById: async () => ({ code: 3000, data: { ID: '1' } }) },
      },
      undefined,
      permission,
      cache.hydrate.bind(cache),
    ),
    getRecordById,
  };
}

describe('shipped project-first gateway', () => {
  it('reuses complete rows and requests only missing file metadata and fields', async () => {
    const { records, getRecordById } = gateway({
      ID: '1',
      PO: [{ ID: '2', Subject: '' }],
      Issue_Register: [{ ID: '3', Subject: 'Project subject' }],
      Milestone_Tracker: [{ ID: '4', Signature: '/project/signature' }],
      Software_Iteration: [{ ID: '5', Subject: null }],
    });
    const result = await records.get('1');
    expect(getRecordById.mock.calls.map(([config]) => config)).toEqual([
      { report_name: 'Project_Report', id: '1', field_config: 'all' },
      { report_name: 'Issue_Registers', id: '3', field_config: 'custom', fields: 'Staff,Files' },
      { report_name: 'Milestones', id: '4', field_config: 'custom', fields: 'File_upload' },
    ]);
    expect(result.raw.Issue_Register[0].Subject).toBe('Project subject');
    expect(result.raw.Milestone_Tracker[0].Signature).toBe('/project/signature');
    await records.readOnlySectionRows(result);
    expect(getRecordById).toHaveBeenCalledTimes(3);
  });

  it('rechecks the project on reopen without repeating missing field or file metadata reads', async () => {
    const { records, getRecordById } = gateway({
      ID: '1',
      Issue_Register: [{ ID: '2', Subject: 'project' }],
      Milestone_Tracker: [{ ID: '3', Signature: '/signature' }],
    });
    await records.get('1');
    await records.get('1');
    expect(
      getRecordById.mock.calls.filter(([c]) => c.report_name === 'Project_Report'),
    ).toHaveLength(2);
    expect(
      getRecordById.mock.calls.filter(([c]) => c.report_name === 'Issue_Registers'),
    ).toHaveLength(1);
    expect(getRecordById.mock.calls.filter(([c]) => c.report_name === 'Milestones')).toHaveLength(
      1,
    );
  });

  it('rechecks cached missing fields before saving and detects a changed attachment', async () => {
    let name = 'old.png';
    const { records, getRecordById } = gateway(
      { ID: '1', Project_Name: 'Original', Issue_Register: [{ ID: '2', Subject: 'project' }] },
      undefined,
      () => name,
    );
    const original = await records.get('1');
    name = 'new.png';
    await expect(records.update(original, { Project_Name: 'Changed' })).rejects.toThrow(
      'record changed',
    );
    expect(
      getRecordById.mock.calls.filter(([c]) => c.report_name === 'Issue_Registers'),
    ).toHaveLength(2);
  });

  it('bypasses cached permissions before allowing Project ID updates', async () => {
    const permission = vi.fn(async () => false);
    const { records } = gateway({ ID: '1' }, permission);
    await expect(
      records.update({ id: '1', raw: { ID: '1' } }, { Project_ID: 'changed' }),
    ).rejects.toThrow('Only project admins');
    expect(permission).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('reuses embedded BOM rows and only hydrates missing fields without querying the BOM report list', async () => {
    const runtime = createProjectCacheRuntime({ DATA: {} }, { app: 'embedded-test' }, [
      'Notes',
      'Original_SN',
    ]);
    const getBomFields = vi.fn(async () => ({
      id: '2',
      raw: { ID: '2', Notes: 'filled', Original_SN: 'wrong' },
    }));
    const bom = vi.fn(async () => ({ records: [] }));
    const source = {
      list: async () => ({ records: [] }),
      get: async () => ({ id: '1', raw: { BOM: [{ ID: '2', Original_SN: 'project SN' }] } }),
      getBom: vi.fn(),
      getBomFields,
      bom,
    };
    const cached = runtime.attach(source, source);
    try {
      const result = await cached.prepareEditor('1');
      expect(bom).not.toHaveBeenCalled();
      expect(source.getBom).not.toHaveBeenCalled();
      expect(getBomFields).toHaveBeenCalledExactlyOnceWith('2', ['Notes']);
      expect(result.bom[0].raw).toEqual({ ID: '2', Original_SN: 'project SN', Notes: 'filled' });
    } finally {
      cached.disposeCache();
    }
  });
  it('checks linked BOM records when the project BOM array is empty', async () => {
    const runtime = createProjectCacheRuntime({ DATA: {} }, { app: 'empty-bom-test' }, ['Notes']);
    const bom = vi.fn(async () => ({ records: [{ id: '2', raw: { ID: '2', Notes: '' } }] }));
    const source = {
      list: async () => ({ records: [] }),
      get: async () => ({ id: '1', raw: { BOM: [] } }),
      getBom: vi.fn(),
      bom,
    };
    const cached = runtime.attach(source, source);
    try {
      expect((await cached.prepareEditor('1')).bom).toHaveLength(1);
      expect(bom).toHaveBeenCalledExactlyOnceWith('1', undefined);
      expect(source.getBom).not.toHaveBeenCalled();
    } finally {
      cached.disposeCache();
    }
  });
});
