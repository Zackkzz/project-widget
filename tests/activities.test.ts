import type { LookupOption } from '../app/src/domain/types/lookup.types';
import type { ActivityRow } from '../app/src/domain/types/activities.types';
import { describe, it, expect } from 'vitest';
import { ACTIVITIES, newActivity, changeActivity } from '../app/src/domain/activities';
import { newDraft, toPayload, updateDraft, validate } from '../app/src/domain/project';
import { batchSerials, bomSummary } from '../app/src/domain/bom';
import { creatorDateTime, sydneyNow } from '../app/src/domain/dates';
const definition = (name: string) => ACTIVITIES.find((def) => def.name === name)!;
const reference: LookupOption = {
  id: '100000000000000001',
  label: 'RECT-1',
  rectification: {
    parentId: '100000000000000002',
    type: 'Software',
    productLine: { id: '100000000000000003', label: 'Storage' },
    faults: [{ id: '100000000000000004', label: 'Fault' }],
    packages: [{ type: 'Master', version: '2.0' }],
  },
};
function draft() {
  return { ...newDraft(), Project_Type: 'C&I - Project Team' };
}
describe('Optional project activities', () => {
  it('validates active subforms and omits them after switching to channel', () => {
    const d = draft();
    d.Software_Iteration = [newActivity(definition('Software_Iteration'))];
    expect(validate(d, 2)).toHaveProperty('Software_Iteration.0.MCU');
    expect(validate(d, 2)).toHaveProperty('Software_Iteration.0.Upgrade_Engineer');
    d.Project_Type = 'C&I - Channel';
    expect(validate(d, 2)).toEqual({});
    expect(toPayload(d)).not.toHaveProperty('Software_Iteration');
  });
  it('maps rectification metadata, defaults target version and excludes dormant hardware fields', () => {
    const d = draft();
    let row = newActivity(definition('Rectification'));
    row = changeActivity(row, 'Rectification_ID_Project', reference);
    row = changeActivity(row, 'Changed_Software_Type', 'Master');
    row.values.Hardware_Modification = 'stale hidden value';
    d.Rectification = [row];
    expect(row.values.Updated_Software_Version).toBe('2.0');
    expect(validate(d, 2)).toEqual({});
    const result = (toPayload(d).Rectification as Record<string, unknown>[])[0];
    expect(result).toMatchObject({
      Rectification_ID_Project: reference.id,
      Rectification_ID: reference.rectification!.parentId,
      Product_Line: reference.rectification!.productLine.id,
      Fault: ['100000000000000004'],
      Changed_Software_Type: 'Master',
      Updated_Software_Version: '2.0',
    });
    expect(result).not.toHaveProperty('Hardware_Modification');
    expect(result).not.toHaveProperty('key');
    row = changeActivity(row, 'Rectification_ID_Project', null);
    expect(row.values.Fault).toEqual([]);
    expect(row.values.Updated_Software_Version).toBe('');
  });
  it('serializes issue rows with the native add-row marker and leaves identifiers to Creator', () => {
    const d = draft();
    const row = newActivity(definition('Issue_Register'));
    Object.assign(row.values, {
      Issue_Level: 'Major',
      Issue_Type: 'Hardware',
      Subject_field: ' Fault ',
      Staff: [{ id: '91234', label: 'Engineer' }],
      Issue_Start_Date: '2026-09-18',
      Issue_ID: 'should not leak',
    });
    d.Issue_Register = [row];
    expect(toPayload(d).Issue_Register).toEqual([
      {
        Issue_Level: 'Major',
        Issue_Type: 'Hardware',
        Subject_field: 'Fault',
        Staff: ['91234'],
        Issue_Start_Date: '18/09/2026',
        Is_Subform: true,
        Issue_Status: 'Opened',
      },
    ]);
  });
  it('checks ticket date order, applies status on end-time input, and clears addresses on site/client changes', () => {
    let d = draft();
    let row = newActivity(definition('Service_Tickets'));
    row = changeActivity(row, 'Aimed_End_Time', '2020-01-01T13:00');
    expect(row.values.Status).toBe('Executed');
    row = changeActivity(row, 'Aimed_End_Time', '2099-01-01T13:00');
    expect(row.values.Status).toBe('Pending');
    Object.assign(row.values, {
      Subject_field: 'Visit',
      Service_Type: 'Inspection',
      Staff: [{ id: '1', label: 'A' }],
      Start_Time: '2099-01-02T14:00',
      Address: 'Old site',
    });
    d.Site = { id: '2', label: 'Old site' };
    d.Service_Tickets = [row];
    expect(validate(d, 2)['Service_Tickets.0.Aimed_End_Time']).toMatch('End time');
    d = updateDraft(d, 'Client', { id: '3', label: 'Another client' });
    expect(d.Service_Tickets[0].values.Address).toBe('');
  });
  it('detects the native endpoint conflicts between unsaved pending tickets', () => {
    const d = draft();
    const first = newActivity(definition('Service_Tickets'));
    Object.assign(first.values, {
      Subject_field: 'One',
      Service_Type: 'Inspection',
      Staff: [{ id: '1', label: 'A' }],
      Start_Time: '2099-01-01T10:00',
      Aimed_End_Time: '2099-01-01T14:00',
      Address: 'Online',
    });
    const second: ActivityRow = {
      ...first,
      key: 'second',
      values: {
        ...first.values,
        Start_Time: '2099-01-01T12:00',
        Aimed_End_Time: '2099-01-01T16:00',
      },
    };
    d.Service_Tickets = [first, second];
    expect(validate(d, 2)['Service_Tickets.1.Start_Time']).toMatch('conflicting');
    second.values.Staff = [{ id: '2', label: 'B' }];
    expect(validate(d, 2)).toEqual({});
  });
});
describe('Batch BOM and Sydney dates', () => {
  it('cleans native batch separators and retains serial order', () => {
    expect(batchSerials(' A 1;\r\n\tB2；\n\nA1')).toEqual(['A1', 'B2', 'A1']);
  });
  it('extends project warranty when a BOM date changes without shortening it on removal', () => {
    let d = draft();
    const row = {
      key: '1',
      Original_Product_Model: { id: '2', label: 'Model' },
      Original_SN: 'SN1',
      Original_Quantity: '2',
      Warranty_Type: null,
      Warranty_Start_Date: '',
      Warranty_End_Date: '2030-01-01',
    };
    d = updateDraft(d, 'BOM', [row]);
    expect(d.Warranty_End_Date).toBe('2030-01-01');
    expect(bomSummary([row, { ...row, key: '2', Original_Quantity: '3' }])[0].quantity).toBe(5);
    d = updateDraft(d, 'BOM', []);
    expect(d.Warranty_End_Date).toBe('2030-01-01');
  });
  it('uses Sydney timezone for defaults and formats API times without browser timezone conversion', () => {
    expect(sydneyNow(new Date('2026-01-01T14:00:00Z'))).toBe('2026-01-02T01:00');
    expect(sydneyNow(new Date('2026-07-01T14:00:00Z'))).toBe('2026-07-02T00:00');
    expect(creatorDateTime('2026-09-18T14:30')).toBe('18/09/2026 14:30:00');
    expect(() => creatorDateTime('2026-02-31T14:30')).toThrow();
  });
});
