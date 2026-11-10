import type { ProjectDraft, Errors } from './types/project.types';
import { activityPayload, validateActivities } from './activities';
import { addMonths, validDate, creatorDate } from './dates';
export { addMonths, validDate, creatorDate } from './dates';

export const PROJECT_TYPES = [
  'Sub 5MW PV&Storage',
  'Utility',
  'C&I - Project Team',
  'C&I - Direct Sales',
  'C&I - Channel',
];
export const SCENARIOS = [
  'Grid-GFM',
  'Grid-GFL',
  'Off-Grid',
  'FCAS',
  'with Genset',
  'Other Customisation',
];
export const STATUSES = [
  'Pre-Sale Consulting & HL Design',
  'Site Design',
  'Manufacturing',
  'Installing',
  'Commissioning',
  'HP Testing',
  'O&M',
  'Out of Warranty',
];
export const SERVICE_TYPES = [
  'Inspection',
  'Maintenance',
  'Warranty Repair / Replacement',
  'Commissioning Repair / Replacement',
  'Commissioning Support - On Site',
  'Commissioning Support - Remote',
  'Rectfication',
  'Pre-Sale Consulting',
  'Technical & Design',
  'Remote Troubleshooting',
  'On-Site Troubleshooting',
  'Spare Part Order or Delivery',
];
export const STEPS = ['Project details', 'Client & site', 'Equipment & dates', 'Review'];
export function newDraft(): ProjectDraft {
  return {
    Project_Name: '',
    Project_Type: '',
    Scenario: [],
    Coupling_Type: '',
    Product_Line: '',
    Status: 'Manufacturing',
    Country: null,
    State: '',
    Client: null,
    Site: null,
    Project_Manager: null,
    Sales: null,
    Distributor: null,
    C4: [],
    Stakeholders: '',
    PCS_Capacity: '0',
    BESS_Capacity: '0',
    Inverter_Capacity: '0',
    BX_Code: '',
    Project_Notes: '',
    EXW_Factory_Date: '',
    Estimated_Commission_Date: '',
    Commission_Complete_Date: '',
    Warranty_Commencement_Date: '',
    Warranty_End_Date: '',
    Configuration: [],
    PO: [],
    BOM: [],
    Service_Requests: [],
    Warranty_Tickets: [],
    Issue_Register: [],
    Software_Iteration: [],
    Rectification: [],
    Service_Tickets: [],
  };
}
export const rowKey = () => crypto.randomUUID();
export const isChannel = (type: string) => ['C&I - Channel', 'C&I - Direct Sales'].includes(type);
export const needsPO = (type: string) => Boolean(type) && !type.includes('C&I');
export const hasCommissionDate = (status: string) =>
  ['HP Testing', 'O&M', 'Out of Warranty'].includes(status);
export const hasWarranty = (status: string) => ['O&M', 'Out of Warranty'].includes(status);
export function warrantyStart(draft: ProjectDraft): string {
  const limit = addMonths(draft.EXW_Factory_Date, 6);
  return limit && draft.Commission_Complete_Date
    ? [limit, draft.Commission_Complete_Date].sort()[0]
    : '';
}
export function updateDraft<K extends keyof ProjectDraft>(
  draft: ProjectDraft,
  key: K,
  value: ProjectDraft[K],
): ProjectDraft {
  const next = { ...draft, [key]: value };
  if (key === 'Client') next.Site = null;
  if (key === 'Client' || key === 'Site') {
    next.Service_Tickets = next.Service_Tickets.map((row) => ({
      ...row,
      values: { ...row.values, Address: row.values.Address === 'Online' ? 'Online' : '' },
    }));
  }
  if (key === 'BOM') {
    // Native BOM_Warranty_End_Date only extends the project end date; removal never shortens it.
    const changedEnds = next.BOM.filter(
      (row) =>
        row.Warranty_End_Date &&
        draft.BOM.find((old) => old.key === row.key)?.Warranty_End_Date !== row.Warranty_End_Date,
    ).map((row) => row.Warranty_End_Date);
    next.Warranty_End_Date = [next.Warranty_End_Date, ...changedEnds].sort().at(-1) ?? '';
  }
  if (key === 'Country') next.State = '';
  if (key === 'EXW_Factory_Date' && next.Project_Type === PROJECT_TYPES[0]) {
    next.Estimated_Commission_Date = addMonths(next.EXW_Factory_Date, 4);
  }
  if (key === 'Commission_Complete_Date') {
    const computed = warrantyStart(next);
    if (computed) next.Warranty_Commencement_Date = computed;
  }
  return next;
}

export function validate(d: ProjectDraft, step?: number): Errors {
  const errors: Errors = {};
  const required = (key: string, value: unknown, label: string) => {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && !value.length)
    )
      errors[key] = `Please enter ${label}.`;
  };
  const number = (key: string, value: string, label: string, positive = false) => {
    if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < (positive ? 1 : 0)))
      errors[key] = `${label} must be ${positive ? 'at least 1' : 'zero or greater'}.`;
  };
  if (step === undefined || step === 0) {
    required('Project_Type', d.Project_Type, 'a project type');
    required('Scenario', d.Scenario, 'at least one scenario');
    required('Coupling_Type', d.Coupling_Type, 'a coupling type');
    required('Status', d.Status, 'a status');
  }
  if (step === undefined || step === 1) {
    required('Client', d.Client, 'a client');
    required('Country', d.Country, 'a country');
    if (d.Country?.states?.length) required('State', d.State, 'a state');
    if (d.State && !d.Country?.states?.includes(d.State))
      errors.State = 'Select a state from the chosen country.';
  }
  if (step === undefined || step === 2) {
    const date = (key: string, value: string) => {
      if (value && !validDate(value)) errors[key] = 'Enter a valid date.';
    };
    if (!isChannel(d.Project_Type)) {
      Object.assign(errors, validateActivities(d));
      date('EXW_Factory_Date', d.EXW_Factory_Date);
      if (d.EXW_Factory_Date) date('Estimated_Commission_Date', d.Estimated_Commission_Date);
    }
    if (hasCommissionDate(d.Status)) date('Commission_Complete_Date', d.Commission_Complete_Date);
    if (hasWarranty(d.Status)) {
      date('Warranty_Commencement_Date', d.Warranty_Commencement_Date);
      date('Warranty_End_Date', d.Warranty_End_Date);
    }
    for (const k of ['PCS_Capacity', 'BESS_Capacity', 'Inverter_Capacity'] as const)
      number(k, d[k], 'Capacity');
    d.Configuration.forEach((r, i) => {
      required(`Configuration.${i}.Model`, r.Model, 'a model');
      required(`Configuration.${i}.Number`, r.Number, 'a quantity');
      number(`Configuration.${i}.Number`, r.Number, 'Quantity', true);
      if (r.Number && !Number.isInteger(Number(r.Number)))
        errors[`Configuration.${i}.Number`] = 'Quantity must be a whole number.';
    });
    if (needsPO(d.Project_Type) && !d.PO.length)
      errors.PO = 'Add at least one purchase order for this project type.';
    d.PO.forEach((r, i) => {
      required(`PO.${i}.PO_Number`, r.PO_Number, 'a PO number');
      required(`PO.${i}.Date_field`, r.Date_field, 'a PO date');
      if (r.Date_field && !validDate(r.Date_field))
        errors[`PO.${i}.Date_field`] = 'Enter a valid date.';
      number(`PO.${i}.Amount`, r.Amount, 'Amount');
    });
    d.BOM.forEach((r, i) => {
      date(`BOM.${i}.Warranty_Start_Date`, r.Warranty_Start_Date);
      date(`BOM.${i}.Warranty_End_Date`, r.Warranty_End_Date);
      required(`BOM.${i}.Original_Product_Model`, r.Original_Product_Model, 'a product model');
      required(`BOM.${i}.Original_Quantity`, r.Original_Quantity, 'a quantity');
      number(`BOM.${i}.Original_Quantity`, r.Original_Quantity, 'Quantity', true);
      if (r.Original_Quantity && !Number.isInteger(Number(r.Original_Quantity)))
        errors[`BOM.${i}.Original_Quantity`] = 'Quantity must be a whole number.';
      if (
        r.Warranty_Start_Date &&
        r.Warranty_End_Date &&
        r.Warranty_End_Date < r.Warranty_Start_Date
      )
        errors[`BOM.${i}.Warranty_End_Date`] = 'Warranty end must be on or after its start.';
    });
    if (
      hasWarranty(d.Status) &&
      d.Warranty_Commencement_Date &&
      d.Warranty_End_Date &&
      d.Warranty_End_Date < d.Warranty_Commencement_Date
    )
      errors.Warranty_End_Date = 'Warranty end must be on or after its start.';
    if (isChannel(d.Project_Type))
      d.Service_Requests.forEach((r, i) => {
        date(`Service_Requests.${i}.Start_Date`, r.Start_Date);
        date(`Service_Requests.${i}.Close_Date`, r.Close_Date);
        if (r.Start_Date && r.Close_Date && r.Close_Date < r.Start_Date)
          errors[`Service_Requests.${i}.Close_Date`] =
            'Close date must be on or after the start date.';
        for (const [field, label] of [
          ['Subject_field', 'a subject'],
          ['Staff', 'staff'],
          ['Type_field', 'a team'],
          ['Service_Type', 'a service type'],
          ['External_or_Internal', 'external or internal'],
          ['Status', 'a status'],
        ] as const)
          required(`Service_Requests.${i}.${field}`, r[field], label);
      });
  }
  return errors;
}
/** Only explicitly supported fields are serialized. Hidden conditional sections stay out of the request. */
export function toPayload(d: ProjectDraft): Record<string, unknown> {
  const data: Record<string, unknown> = {
    Project_Type: d.Project_Type,
    Scenario: d.Scenario,
    Coupling_Type: d.Coupling_Type,
    Status: d.Status,
  };
  const put = (key: string, value: unknown) => {
    if (value !== '' && value !== null && value !== undefined) data[key] = value;
  };
  for (const key of ['Project_Name', 'Stakeholders', 'Project_Notes'] as const)
    put(key, d[key].trim());
  for (const key of [
    'Country',
    'Client',
    'Site',
    'Project_Manager',
    'Sales',
    'Distributor',
  ] as const)
    put(key, d[key]?.id);
  // Keep the dropdown in the UI, but submit its text to Creator's unrestricted field.
  data.State = d.Country?.states?.length ? d.State : '';
  for (const key of ['PCS_Capacity', 'BESS_Capacity', 'Inverter_Capacity'] as const)
    if (d[key] !== '') put(key, Number(d[key]));
  if (d.C4.length) data.C4 = d.C4.map((v) => v.id);
  if (!isChannel(d.Project_Type)) {
    put('Product_Line', d.Product_Line);
    put('BX_Code', d.BX_Code.trim());
    if (d.EXW_Factory_Date) {
      put('EXW_Factory_Date', creatorDate(d.EXW_Factory_Date));
      if (d.Estimated_Commission_Date)
        put('Estimated_Commission_Date', creatorDate(d.Estimated_Commission_Date));
    }
  }
  if (hasCommissionDate(d.Status) && d.Commission_Complete_Date)
    put('Commission_Complete_Date', creatorDate(d.Commission_Complete_Date));
  if (hasWarranty(d.Status))
    for (const k of ['Warranty_Commencement_Date', 'Warranty_End_Date'] as const)
      if (d[k]) put(k, creatorDate(d[k]));
  if (d.Configuration.length)
    data.Configuration = d.Configuration.map((r) => ({
      Model: r.Model!.id,
      Number: Number(r.Number),
    }));
  if (d.PO.length)
    data.PO = d.PO.map(({ key: _key, ...r }) => ({
      ...r,
      PO_Number: r.PO_Number.trim(),
      Date_field: creatorDate(r.Date_field),
      ...(r.Amount ? { Amount: Number(r.Amount) } : { Amount: '' }),
    }));
  if (d.BOM.length) {
    data.BOM_Display = 'Detail View';
    data.BOM = d.BOM.map((r) => ({
      Original_Product_Model: r.Original_Product_Model!.id,
      Original_SN: r.Original_SN.trim(),
      Original_Quantity: Number(r.Original_Quantity),
      ...(r.Warranty_Type ? { Warranty_Type: r.Warranty_Type.id } : {}),
      ...(r.Warranty_Start_Date ? { Warranty_Start_Date: creatorDate(r.Warranty_Start_Date) } : {}),
      ...(r.Warranty_End_Date ? { Warranty_End_Date: creatorDate(r.Warranty_End_Date) } : {}),
    }));
  }
  if (!isChannel(d.Project_Type)) Object.assign(data, activityPayload(d));
  if (isChannel(d.Project_Type) && d.Service_Requests.length)
    data.Service_Requests = d.Service_Requests.map((r) => ({
      Subject_field: r.Subject_field.trim(),
      Staff: r.Staff.map((s) => s.id),
      Type_field: r.Type_field!.id,
      Service_Type: r.Service_Type,
      External_or_Internal: r.External_or_Internal,
      Status: r.Status,
      External_Reference: r.External_Reference.trim(),
      Address: r.Address.trim() || 'Online',
      ...(r.Close_Date ? { Close_Date: creatorDate(r.Close_Date) } : {}),
      Job_Description: r.Job_Description.trim(),
      ...(r.Start_Date ? { Start_Date: creatorDate(r.Start_Date) } : {}),
    }));
  return data;
}
