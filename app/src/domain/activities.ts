import type {
  ActivityDefinition,
  ActivityValue,
  ActivityRow,
  ActivityField,
} from './types/activities.types';
import type { LookupOption } from './types/lookup.types';
import type { ProjectDraft, Errors } from './types/project.types';

import { creatorDate, creatorDateTime, sydneyNow, validDate, validDateTime } from './dates';

/** Only fields available during Project creation belong here. Generated IDs and parent links are server-owned. */
export const ACTIVITIES: ActivityDefinition[] = [
  {
    name: 'Warranty_Tickets',
    title: 'Warranty tickets',
    singular: 'warranty ticket',
    description: 'Link an existing warranty claim and record the affected items.',
    fields: [
      { name: 'Project_Claim_0', label: 'Project claim', type: 'lookup', source: 'claims' },
      { name: 'C4_Number', label: 'C4 number', type: 'textarea' },
      { name: 'Items', label: 'Items', type: 'textarea' },
    ],
  },
  {
    name: 'Issue_Register',
    title: 'Issue register',
    singular: 'issue',
    description:
      'Record known issues. Files, job logs, and links to newly created service tickets can be added in Creator after creation.',
    fields: [
      { name: 'Subject_field', label: 'Issue subject', type: 'text' },
      {
        name: 'Issue_Level',
        label: 'Issue level',
        type: 'select',
        options: ['Critical', 'Major', 'Minor'],
        required: true,
      },
      {
        name: 'Issue_Type',
        label: 'Issue type',
        type: 'select',
        options: ['Hardware', 'Software', 'Other'],
        required: true,
      },
      { name: 'Spare_Part', label: 'Spare parts', type: 'multi', source: 'spareParts' },
      { name: 'Staff', label: 'Issue staff', type: 'multi', source: 'staff' },
      { name: 'Issue_Start_Date', label: 'Issue start date', type: 'date' },
      { name: 'Aimed_Closed_Date', label: 'Aimed close date', type: 'date' },
      { name: 'Issue_Close_Date', label: 'Issue close date', type: 'date' },
      {
        name: 'HQ_Investigation_Required',
        label: 'HQ investigation required',
        type: 'select',
        options: ['Yes', 'No'],
      },
      { name: 'Fault_Description', label: 'Fault description', type: 'text' },
      { name: 'Issue_Description', label: 'Issue description', type: 'textarea' },
    ],
  },
  {
    name: 'Software_Iteration',
    title: 'Software changes',
    singular: 'software change',
    description: 'Record an upgrade. Creator maintains its related iteration log.',
    fields: [
      { name: 'MCU', label: 'MCU', type: 'lookup', source: 'mcus', required: true },
      {
        name: 'Software_Type',
        label: 'Software type',
        type: 'select',
        options: ['General Availability', 'Temporary'],
        required: true,
      },
      { name: 'Current_Version', label: 'Current version', type: 'text' },
      { name: 'Target_Version', label: 'Target version', type: 'text' },
      { name: 'Software_Material_Code', label: 'Software material code', type: 'text' },
      {
        name: 'Upgrade_Date',
        label: 'Upgrade date',
        type: 'date',
        initial: 'today',
        required: true,
      },
      {
        name: 'Upgrade_Engineer',
        label: 'Upgrade engineer',
        type: 'lookup',
        source: 'engineers',
        required: true,
        hint: 'Service team members based in Australia.',
      },
      {
        name: 'Upgrade_Method',
        label: 'Upgrade method',
        type: 'select',
        options: ['Remote', 'On-Site'],
        required: true,
      },
      { name: 'Change_Description', label: 'Change description', type: 'textarea' },
    ],
  },
  {
    name: 'Rectification',
    title: 'Rectifications',
    singular: 'rectification',
    description:
      'Select an existing rectification project to load its product line, faults, and software packages.',
    fields: [
      {
        name: 'Rectification_ID_Project',
        label: 'Rectification ID',
        type: 'lookup',
        source: 'rectifications',
        required: true,
      },
      { name: 'Serial_Number', label: 'Rectification serial number', type: 'text' },
      { name: 'Product_Code', label: 'Product code', type: 'text' },
      { name: 'Product_Model', label: 'Product model name', type: 'text' },
      { name: 'Fault', label: 'Faults', type: 'multi', source: 'faults' },
      {
        name: 'Hardware_Modification',
        label: 'Hardware modification',
        type: 'text',
        forType: 'Hardware',
      },
      {
        name: 'Changed_Software_Type',
        label: 'Changed software type',
        type: 'select',
        forType: 'Software',
      },
      {
        name: 'Existing_Software_Version',
        label: 'Existing software version',
        type: 'text',
        forType: 'Software',
      },
      {
        name: 'Updated_Software_Version',
        label: 'Updated software version',
        type: 'text',
        forType: 'Software',
      },
      { name: 'Power_Plant_Name', label: 'Power plant name', type: 'text' },
      { name: 'Created_Date', label: 'Rectification date', type: 'date', initial: 'today' },
    ],
  },
  {
    name: 'Service_Tickets',
    title: 'Internal service tickets',
    singular: 'service ticket',
    description:
      'Schedule staff in Australia/Sydney time. Pending tickets are checked for conflicts before submission. Daily logs are managed after creation.',
    fields: [
      { name: 'Subject_field', label: 'Ticket subject', type: 'text', required: true },
      {
        name: 'Service_Type',
        label: 'Ticket service type',
        type: 'select',
        required: true,
        options: [
          'Inspection',
          'Maintenance',
          'Commissioning Support',
          'Battery Charge',
          'Training',
          'Conference',
          'Trouble Shooting',
          'On Leave',
          'Only Remote Available',
          'Others',
        ],
      },
      { name: 'Staff', label: 'Ticket staff', type: 'multi', source: 'staff', required: true },
      { name: 'Start_Time', label: 'Start time (Sydney)', type: 'datetime-local', required: true },
      {
        name: 'Aimed_End_Time',
        label: 'Aimed end time (Sydney)',
        type: 'datetime-local',
        required: true,
      },
      { name: 'End_Time', label: 'Actual end time (Sydney)', type: 'datetime-local' },
      {
        name: 'Status',
        label: 'Ticket status',
        type: 'select',
        options: ['Pending', 'To Confirm', 'Executed'],
        initial: 'Pending',
      },
      { name: 'Address', label: 'Ticket address', type: 'select', required: true },
      { name: 'Job_Description', label: 'Ticket description', type: 'textarea' },
    ],
  },
];

export function selected(value: ActivityValue | undefined): LookupOption | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
export function rectification(row: ActivityRow) {
  return selected(row.values.Rectification_ID_Project)?.rectification;
}
export function activityFields(
  definition: ActivityDefinition,
  row: ActivityRow,
  draft: ProjectDraft,
): ActivityField[] {
  return definition.fields
    .filter((f) => !f.forType || f.forType === rectification(row)?.type)
    .map((f) => {
      if (f.name === 'Changed_Software_Type')
        return {
          ...f,
          options: [...new Set(rectification(row)?.packages.map((p) => p.type) ?? [])],
        };
      if (f.name === 'Address')
        return { ...f, options: ['Online', ...(draft.Site ? [draft.Site.label] : [])] };
      return f;
    });
}
export function newActivity(def: ActivityDefinition): ActivityRow {
  return {
    key: crypto.randomUUID(),
    values: Object.fromEntries(
      def.fields.map((f) => [
        f.name,
        f.type === 'multi'
          ? []
          : f.type === 'lookup'
            ? null
            : f.initial === 'today'
              ? sydneyNow().slice(0, 10)
              : (f.initial ?? ''),
      ]),
    ),
  };
}
export function changeActivity(row: ActivityRow, name: string, value: ActivityValue): ActivityRow {
  const next = { ...row, values: { ...row.values, [name]: value } };
  if (name === 'Rectification_ID_Project') {
    next.values.Fault = selected(value)?.rectification?.faults ?? [];
    for (const field of [
      'Hardware_Modification',
      'Changed_Software_Type',
      'Existing_Software_Version',
      'Updated_Software_Version',
    ])
      next.values[field] = '';
  }
  if (name === 'Changed_Software_Type')
    next.values.Updated_Software_Version =
      rectification(next)?.packages.find((p) => p.type === value)?.version ?? '';
  if (name === 'Aimed_End_Time' && typeof value === 'string' && validDateTime(value))
    next.values.Status = value <= sydneyNow() ? 'Executed' : 'Pending';
  return next;
}
export function validateActivities(draft: ProjectDraft): Errors {
  const errors: Errors = {};
  for (const def of ACTIVITIES)
    draft[def.name].forEach((row, i) => {
      for (const field of activityFields(def, row, draft)) {
        const value = row.values[field.name];
        const key = `${def.name}.${i}.${field.name}`;
        if (
          field.required &&
          (!value ||
            (typeof value === 'string' && !value.trim()) ||
            (Array.isArray(value) && !value.length))
        )
          errors[key] = `Please enter ${field.label.toLowerCase()}.`;
        if (typeof value !== 'string' || !value) continue;
        if (field.type === 'date' && !validDate(value)) errors[key] = 'Enter a valid date.';
        if (field.type === 'datetime-local' && !validDateTime(value))
          errors[key] = 'Enter a valid date and time.';
        if (field.type === 'select' && !field.options?.includes(value))
          errors[key] = 'Select one of the available options.';
      }
      if (def.name === 'Rectification' && !rectification(row))
        errors[`${def.name}.${i}.Rectification_ID_Project`] =
          'Select a rectification with complete project details.';
      if (def.name === 'Service_Tickets') {
        const v = row.values;
        for (const end of ['Aimed_End_Time', 'End_Time'])
          if (v.Start_Time && v[end] && String(v[end]) < String(v.Start_Time))
            errors[`${def.name}.${i}.${end}`] = 'End time must be on or after the start time.';
      }
    });
  // Apply the two endpoint checks used by the existing input workflows to unsaved tickets too.
  draft.Service_Tickets.forEach((row, i) => {
    const v = row.values;
    const staff = Array.isArray(v.Staff) ? v.Staff : [];
    draft.Service_Tickets.forEach((other, j) => {
      const o = other.values;
      if (
        i === j ||
        o.Status !== 'Pending' ||
        !Array.isArray(o.Staff) ||
        !o.Staff.some((s) => staff.some((t) => t.id === s.id))
      )
        return;
      if (
        v.Start_Time &&
        o.Start_Time &&
        o.Aimed_End_Time &&
        String(o.Start_Time) <= String(v.Start_Time) &&
        String(o.Aimed_End_Time) > String(v.Start_Time)
      )
        errors[`Service_Tickets.${i}.Start_Time`] =
          `Staff have a conflicting pending ticket in row ${j + 1}.`;
      if (
        v.Aimed_End_Time &&
        o.Start_Time &&
        o.Aimed_End_Time &&
        String(o.Start_Time) < String(v.Aimed_End_Time) &&
        String(o.Aimed_End_Time) >= String(v.Aimed_End_Time)
      )
        errors[`Service_Tickets.${i}.Aimed_End_Time`] =
          `Staff have a conflicting pending ticket in row ${j + 1}.`;
    });
  });
  return errors;
}
export function activityPayload(draft: ProjectDraft): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const def of ACTIVITIES) {
    if (!draft[def.name].length) continue;
    result[def.name] = draft[def.name].map((row) => {
      const data: Record<string, unknown> = {};
      for (const field of activityFields(def, row, draft)) {
        const value = row.values[field.name];
        if (
          value === null ||
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && !value.length)
        )
          continue;
        data[field.name] = Array.isArray(value)
          ? value.map((v) => v.id)
          : typeof value === 'object'
            ? value.id
            : field.type === 'date'
              ? creatorDate(value)
              : field.type === 'datetime-local'
                ? creatorDateTime(value)
                : value.trim();
      }
      if (def.name === 'Issue_Register')
        Object.assign(data, { Is_Subform: true, Issue_Status: 'Opened' });
      if (def.name === 'Service_Tickets')
        Object.assign(data, { Is_Subform: true, Client: draft.Client?.id });
      if (def.name === 'Rectification') {
        const meta = rectification(row)!;
        Object.assign(data, {
          Rectification_ID: meta.parentId,
          ...(meta.gspNumber !== undefined ? { GSP_Number: meta.gspNumber } : {}),
          Type_field: meta.type,
          Product_Line: meta.productLine.id,
        });
      }
      return data;
    });
  }
  return result;
}
export function activityDisplay(value: ActivityValue | undefined): string {
  return Array.isArray(value)
    ? value.map((v) => v.label).join(', ')
    : typeof value === 'object'
      ? (value?.label ?? '')
      : (value ?? '');
}
