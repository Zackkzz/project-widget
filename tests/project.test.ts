import type { ProjectDraft } from '../app/src/domain/types/project.types';
import { describe, it, expect } from 'vitest';
import {
  addMonths,
  creatorDate,
  hasWarranty,
  isChannel,
  newDraft,
  toPayload,
  updateDraft,
  validate,
  warrantyStart,
} from '../app/src/domain/project';
function valid(): ProjectDraft {
  return {
    ...newDraft(),
    Project_Type: 'C&I - Channel',
    Scenario: ['Grid-GFL'],
    Coupling_Type: 'AC Coupling',
    Country: { id: '1000000000000000001', label: 'Australia', states: ['NSW', 'VIC'] },
    State: 'NSW',
    Client: { id: '1000000000000000002', label: 'Example' },
  };
}
describe('Project creation rules', () => {
  it('requires essentials and the state only when the chosen country has states', () => {
    expect(Object.keys(validate(newDraft()))).toEqual(
      expect.arrayContaining(['Project_Type', 'Scenario', 'Coupling_Type', 'Country', 'Client']),
    );
    expect(validate(valid())).toEqual({});
    const d = valid();
    d.State = '';
    expect(validate(d).State).toBeDefined();
    d.Country = { id: '2', label: 'New Zealand', states: [] };
    expect(validate(d)).toEqual({});
  });
  it('reports invalid state choices against State', () => {
    const d = valid();
    d.State = 'QLD';
    expect(validate(d).State).toBe('Select a state from the chosen country.');
    expect(validate(d)).not.toHaveProperty('new_state');
    expect(newDraft()).not.toHaveProperty('new_state');
  });
  it('requires a complete PO for non-C&I projects, including date', () => {
    const d = valid();
    d.Project_Type = 'Utility';
    expect(validate(d).PO).toBeDefined();
    d.PO = [
      {
        key: 'r',
        PO_Number: 'PO-1',
        Date_field: '',
        C4_Number: '',
        PO_Type: '',
        Amount: '',
        Payment_Status: '',
        Status: '',
      },
    ];
    expect(validate(d)['PO.0.Date_field']).toBeDefined();
    d.PO[0].Date_field = '2026-09-17';
    expect(validate(d)).toEqual({});
  });
  it('clears the dependent state and site when parent lookups change', () => {
    const d = valid();
    d.Site = { id: '3', label: 'Old site' };
    expect(updateDraft(d, 'Client', { id: '4', label: 'Other client' }).Site).toBeNull();
    expect(updateDraft(d, 'Country', { id: '5', label: 'New Zealand', states: [] }).State).toBe('');
  });
  it('clamps month-end estimates and respects leap years', () => {
    expect(addMonths('2026-10-31', 4)).toBe('2027-02-28');
    expect(addMonths('2023-10-31', 4)).toBe('2024-02-29');
    expect(addMonths('not-a-date', 4)).toBe('');
    const d = valid();
    d.Project_Type = 'Sub 5MW PV&Storage';
    expect(updateDraft(d, 'EXW_Factory_Date', '2026-10-31').Estimated_Commission_Date).toBe(
      '2027-02-28',
    );
  });
  it('uses the earlier of commissioning and EXW plus six months for warranty', () => {
    const d = {
      ...valid(),
      EXW_Factory_Date: '2026-01-01',
      Commission_Complete_Date: '2026-08-01',
    };
    expect(warrantyStart(d)).toBe('2026-07-01');
    expect(
      updateDraft(d, 'Commission_Complete_Date', '2026-04-01').Warranty_Commencement_Date,
    ).toBe('2026-04-01');
  });
  it('separates C&I channel from project-team behavior', () => {
    expect(isChannel('C&I - Direct Sales')).toBe(true);
    expect(isChannel('C&I - Project Team')).toBe(false);
    expect(hasWarranty('Manufacturing')).toBe(false);
  });
  it('validates subform fields and positive whole-number quantities', () => {
    const d = valid();
    d.Configuration = [{ key: 'x', Model: null, Number: '1.5' }];
    expect(validate(d)['Configuration.0.Model']).toBeDefined();
    expect(validate(d)['Configuration.0.Number']).toBeDefined();
    d.Service_Requests = [
      {
        key: 'r',
        Subject_field: '',
        External_Reference: '',
        Address: 'Online',
        Close_Date: '',
        Staff: [],
        Type_field: null,
        Service_Type: '',
        External_or_Internal: '',
        Start_Date: '',
        Status: 'On-Going',
        Job_Description: '',
      },
    ];
    expect(validate(d)['Service_Requests.0.Staff']).toBeDefined();
  });
});
describe('Creator payload', () => {
  it('sends the selected state text to the renamed State text field without the old field names', () => {
    const d = valid();
    d.State = 'NSW';
    const payload = toPayload(d);
    expect(payload.State).toBe('NSW');
    expect(payload).not.toHaveProperty('New_State');
    expect(payload).not.toHaveProperty('new_state');
  });
  it('clears State when switching to a country without states', () => {
    const d = updateDraft(valid(), 'Country', { id: '5', label: 'New Zealand', states: [] });
    const payload = toPayload(d);
    expect(d.State).toBe('');
    expect(payload.State).toBe('');
    expect(payload).not.toHaveProperty('new_state');
  });
  it('does not submit stale state text for a country without states', () => {
    const d = valid();
    d.Country = { id: '5', label: 'New Zealand', states: [] };
    const payload = toPayload(d);
    expect(payload.State).toBe('');
    expect(payload).not.toHaveProperty('new_state');
  });
  it('retains ID precision and excludes hidden values, UI keys, and workflow overrides', () => {
    const d = valid();
    d.Project_Name = '  Riverbank  ';
    d.EXW_Factory_Date = '2026-10-01';
    d.Product_Line = 'PV';
    d.Warranty_End_Date = '2030-01-01';
    const payload = toPayload(d);
    expect(payload.Client).toBe('1000000000000000002');
    expect(payload.Project_Name).toBe('Riverbank');
    expect(payload).not.toHaveProperty('Product_Line');
    expect(payload).not.toHaveProperty('EXW_Factory_Date');
    expect(payload).not.toHaveProperty('Warranty_End_Date');
    expect(payload).not.toHaveProperty('Project_ID');
    expect(payload).not.toHaveProperty('skip_workflow');
  });
  it('serializes PO dates in the application date format and subform lookups as string IDs', () => {
    const d = valid();
    d.PO = [
      {
        key: 'ui-only',
        PO_Number: 'PO1',
        Date_field: '2026-09-17',
        C4_Number: '',
        PO_Type: '',
        Amount: '123.45',
        Payment_Status: '',
        Status: '',
      },
    ];
    d.Configuration = [
      { key: 'ui-only', Model: { id: '1000000000000000003', label: 'PV' }, Number: '2' },
    ];
    const p = toPayload(d);
    expect(p.PO).toEqual([expect.objectContaining({ Date_field: '17/09/2026', Amount: 123.45 })]);
    expect(p.Configuration).toEqual([{ Model: '1000000000000000003', Number: 2 }]);
    expect(JSON.stringify(p)).not.toContain('ui-only');
    expect(creatorDate('2026-02-28')).toBe('28/02/2026');
    expect(() => creatorDate('2026-02-31')).toThrow();
  });
  it('selects Detail View when creating BOM rows so the existing workflow persists them', () => {
    const d = valid();
    d.BOM = [
      {
        key: 'x',
        Original_Product_Model: { id: '90001', label: 'Model' },
        Original_SN: ' SN1 ',
        Original_Quantity: '1',
        Warranty_Type: null,
        Warranty_Start_Date: '',
        Warranty_End_Date: '',
      },
    ];
    expect(toPayload(d)).toMatchObject({
      BOM_Display: 'Detail View',
      BOM: [{ Original_Product_Model: '90001', Original_SN: 'SN1', Original_Quantity: 1 }],
    });
  });
  it('omits dormant service requests when switching away from channel/direct sales', () => {
    const d = valid();
    d.Project_Type = 'C&I - Project Team';
    d.Service_Requests = [
      {
        key: 'r',
        Subject_field: 'Old request',
        External_Reference: '',
        Address: 'Online',
        Close_Date: '',
        Staff: [],
        Type_field: null,
        Service_Type: '',
        External_or_Internal: '',
        Start_Date: '',
        Status: 'On-Going',
        Job_Description: '',
      },
    ];
    expect(toPayload(d)).not.toHaveProperty('Service_Requests');
  });
});

it('preserves service-request location, external reference and close date', () => {
  const d = valid();
  d.Site = { id: '1', label: 'Site address' };
  d.Service_Requests = [
    {
      key: 'request',
      Subject_field: 'Support',
      External_Reference: ' EXT-01 ',
      Address: 'Online',
      Close_Date: '2026-09-19',
      Staff: [{ id: '2', label: 'A' }],
      Type_field: { id: '3', label: 'Service' },
      Service_Type: 'Inspection',
      External_or_Internal: 'Internal',
      Start_Date: '2026-09-18',
      Status: 'Closed',
      Job_Description: '',
    },
  ];
  expect(validate(d)).toEqual({});
  expect(toPayload(d).Service_Requests).toEqual([
    expect.objectContaining({
      Address: 'Online',
      External_Reference: 'EXT-01',
      Close_Date: '19/09/2026',
    }),
  ]);
  d.Service_Requests[0].Close_Date = '2026-09-17';
  expect(validate(d)['Service_Requests.0.Close_Date']).toBeDefined();
});
