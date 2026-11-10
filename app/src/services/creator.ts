import type {
  Json,
  Source,
  CreatedProject,
  CreatorSDK,
  Gateway,
  CreatorRecordPage,
} from './types/creator.types';
import type { LookupOption } from '../domain/types/lookup.types';
import type { Errors } from '../domain/types/project.types';
import { creatorDateTime } from '../domain/dates';

export const SOURCES = {
  clients: { report: 'Clients', field: 'Business_Name' },
  countries: {
    report: 'Countries',
    field: 'Country_Name',
    fields: 'Country_Name,Country_Code,States',
  },
  sites: { report: 'Sites', field: 'Site_Address' },
  managers: { report: 'Project_Managers', field: 'Name' },
  sales: { report: 'Sales_List', field: 'Name' },
  distributors: { report: 'Distributor_List', field: 'Company_Name' },
  c4: { report: 'C4_Report', field: 'C4_Number' },
  models: { report: 'Models', field: 'Model' },
  products: {
    report: 'Product_Model_List',
    field: 'Description',
    fields: 'Description,Product_Code',
  },
  warranties: { report: 'Warranty_Types', field: 'Warranty_Type' },
  staff: { report: 'Staff_List', field: 'Staff_name' },
  teams: { report: 'Teams', field: 'Team' },
  claims: { report: 'CSR_Orders', field: 'Reference' },
  mcus: { report: 'MCUs', field: 'Name' },
  engineers: { report: 'Staff_List', field: 'Staff_name' },
  spareParts: {
    report: 'Product_Model_List',
    field: 'Description',
    fields: 'Description,Product_Code',
  },
  faults: { report: 'Fault_List', field: 'Fault_Code' },
  rectifications: {
    report: 'Rectification_Project_Project_Report',
    field: 'Rectification_ID',
    fields:
      'Rectification_ID,Rectification_Project,Type_field,Product_Line,Fault,Software_Packages',
  },
} as const;
export const LOOKUP_PAGE_SIZE = 1000;

export class CreatorError extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
    this.name = 'CreatorError';
  }
}
export function asObject(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
}
export function display(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const record = asObject(value);
  if (typeof record.display_value === 'string') return record.display_value;
  if (typeof record.zc_display_value === 'string') return record.zc_display_value;
  if (record.zc_display_value)
    return Object.values(asObject(record.zc_display_value))
      .map(display)
      .filter(Boolean)
      .join(' · ');
  return '';
}
export function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  const body = asObject(value);
  // Add Records validation failures can put their explanation in an error array.
  const errors = Array.isArray(body.error)
    ? body.error.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : typeof body.error === 'string' && body.error.trim()
      ? [body.error]
      : [];
  if (errors.length) return errors.join('\n');
  if (typeof body.description === 'string' && !body.message)
    return `Zoho request failed${body.code ? ` (code ${body.code})` : ''}: ${body.description}`;
  return typeof body.message === 'string'
    ? body.message
    : `Zoho could not complete the request${body.code ? ` (code ${body.code})` : ''}. No error details were returned.`;
}
function unwrap(value: unknown): Json {
  const response = asObject(value);
  if (typeof response.responseText === 'string') {
    try {
      return asObject(JSON.parse(response.responseText));
    } catch {
      return response;
    }
  }
  return asObject(response.responseText).code ? asObject(response.responseText) : response;
}
function timeout<T>(
  promise: Promise<T>,
  milliseconds = 20000,
  message = 'Zoho did not respond in time.',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CreatorError(message)), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Creator can deliver a no-match result as a response or as an HTTP/SDK rejection. */
function isEmptyRead(body: Json): boolean {
  return [3100, 9280].includes(Number(body.code));
}

/** Normalize report reads without treating access, authentication, or malformed-data errors as empty. */
async function readRecords(sdk: CreatorSDK, config: Json): Promise<CreatorRecordPage> {
  let raw: unknown;
  try {
    raw = await timeout(sdk.DATA.getRecords(config));
  } catch (error) {
    const body = unwrap(error);
    if (isEmptyRead(body)) return { rows: [] };
    throw new CreatorError(messageOf(body));
  }
  const body = unwrap(raw);
  if (isEmptyRead(body)) return { rows: [] };
  if (Number(body.code) !== 3000) throw new CreatorError(messageOf(body));
  if (!Array.isArray(body.data))
    throw new CreatorError('Zoho returned an unrecognised report response.');
  const next =
    body.record_cursor ??
    asObject(raw).record_cursor ??
    asObject(asObject(raw).headers).record_cursor;
  return {
    rows: body.data.map(asObject),
    ...(typeof next === 'string' && next ? { cursor: next } : {}),
  };
}

/** Skip explicitly blank labels; an omitted field still signals a schema or access problem. */
function hasBlankLookupLabel(source: Source, row: Json): boolean {
  const field = SOURCES[source].field;
  return (
    Object.hasOwn(row, field) &&
    (row[field] === null || (typeof row[field] === 'string' && row[field].trim() === ''))
  );
}
/**
 * Escape literal values; report and field names come only from the allowlist above.
 * /\\/g matches each literal backslash; /"/g matches each double quote.
 * /[\r\n]/g matches either carriage return or newline. The g flag replaces every match.
 * Backslashes are escaped first so the later quote escapes remain intact.
 */
export function criteriaString(value: string): string {
  return (
    '"' +
    value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\r\n]/g, ' ') +
    '"'
  );
}
export function parseLookup(source: Source, value: unknown): LookupOption {
  const row = asObject(value),
    definition = SOURCES[source];
  const id = row.ID;
  // ^ and $ anchor the entire ID; \d+ requires one or more decimal digits.
  if (typeof id !== 'string' || !/^\d+$/.test(id))
    throw new CreatorError('Zoho returned a missing or unsafe record ID.');
  const label = display(row[definition.field]);
  if (!label)
    throw new CreatorError(
      Object.hasOwn(row, definition.field)
        ? `The ${definition.report} record has an empty or unreadable ${definition.field}.`
        : `The ${definition.report} report did not return ${definition.field}. Check its field configuration and access.`,
    );
  const option: LookupOption = {
    id,
    label:
      (source === 'products' || source === 'spareParts') && row.Product_Code
        ? `${label} · ${display(row.Product_Code)}`
        : label,
  };
  if (source === 'countries') {
    if (!Object.hasOwn(row, 'States'))
      throw new CreatorError('The Countries report must expose its States subform to this user.');
    const states = row.States;
    if (states !== null && states !== '' && !Array.isArray(states))
      throw new CreatorError('The Countries report returned an unsupported States format.');
    option.states = (Array.isArray(states) ? states : [])
      .map((state) => {
        const item = asObject(state);
        const label = display(item.State ?? asObject(item.zc_display_value).State);
        if (!label)
          throw new CreatorError('The Countries report must expose State for every States row.');
        return label;
      })
      .filter(Boolean);
  }
  if (source === 'rectifications') {
    const related = (value: unknown): LookupOption => {
      const record = asObject(value);
      // ^ and $ anchor the entire ID; \d+ requires one or more decimal digits.
      if (typeof record.ID !== 'string' || !/^\d+$/.test(record.ID) || !display(record))
        throw new CreatorError(
          'The rectification report must expose its related record IDs and labels.',
        );
      return { id: record.ID, label: display(record) };
    };
    if (
      !['Hardware', 'Software'].includes(String(row.Type_field)) ||
      !Object.hasOwn(row, 'Fault') ||
      !Object.hasOwn(row, 'Software_Packages')
    )
      throw new CreatorError(
        'The rectification report must expose its type, faults, and software packages.',
      );
    option.rectification = {
      parentId: related(row.Rectification_Project).id,
      type: row.Type_field as 'Hardware' | 'Software',
      productLine: related(row.Product_Line),
      faults: Array.isArray(row.Fault) ? row.Fault.map(related) : [],
      packages: (Array.isArray(row.Software_Packages) ? row.Software_Packages : []).map((value) => {
        const record = asObject(value);
        const fields = Object.hasOwn(record, 'Software_Type')
          ? record
          : asObject(record.zc_display_value);
        if (!display(fields.Software_Type) || !display(fields.Software_Version))
          throw new CreatorError(
            'Software packages must expose Software_Type and Software_Version.',
          );
        return { type: display(fields.Software_Type), version: display(fields.Software_Version) };
      }),
    };
  }
  return option;
}
export function parseCreated(value: unknown): CreatedProject {
  const body = unwrap(value);
  const result = Array.isArray(body.result) ? asObject(body.result[0]) : body;
  if (!Number.isFinite(Number(body.code)) || !Number.isFinite(Number(result.code)))
    throw new CreatorError(
      'Zoho returned an unrecognised creation response. Check the Project report before trying again.',
      true,
    );
  if (Number(body.code) !== 3000 || Number(result.code) !== 3000)
    throw new CreatorError(messageOf(result));
  const data = asObject(result.data);
  // ^ and $ anchor the entire ID; \d+ requires one or more decimal digits.
  if (typeof data.ID !== 'string' || !/^\d+$/.test(data.ID))
    throw new CreatorError(
      'Zoho responded without a record ID. Check the Project report before trying again.',
      true,
    );
  return { id: data.ID, projectId: display(data.Project_ID) || undefined };
}
let sdkLoading: Promise<CreatorSDK> | undefined;
/** Start before React renders so the SDK can receive Creator's iframe registration. */
export async function loadCreatorSDK(): Promise<CreatorSDK> {
  if (window.ZOHO?.CREATOR) return window.ZOHO.CREATOR;
  if (sdkLoading) return sdkLoading;
  const script = document.createElement('script');
  script.src = 'https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js';
  sdkLoading = timeout(
    new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => {
        reject(
          new CreatorError('Unable to load the Zoho widget SDK. Check the connection and reload.'),
        );
      };
      document.head.appendChild(script);
    }),
    20000,
    'The Zoho widget SDK download timed out. Check access to static.zohocdn.com, then reload the Creator page.',
  )
    .then(() => {
      if (!window.ZOHO?.CREATOR) throw new CreatorError('The Zoho widget SDK is unavailable.');
      return window.ZOHO.CREATOR;
    })
    .catch((error) => {
      script.remove();
      sdkLoading = undefined;
      throw error;
    });
  return sdkLoading;
}
export async function connectCreator(sdkOverride?: CreatorSDK): Promise<Gateway> {
  const sdk = sdkOverride ?? (await loadCreatorSDK());
  const init = asObject(
    await timeout(
      sdk.UTIL.getInitParams(),
      20000,
      'The Zoho SDK loaded, but Creator did not complete the widget connection. Reload the full Creator page. If this continues, reopen the widget from the signed-in application page.',
    ),
  );
  if (init.appLinkName !== 'sungrowauservice')
    throw new CreatorError(
      'Open this widget inside the Sungrow Service (Australia) Creator application.',
    );
  async function records(report: string, fields: string, criteria: string): Promise<Json[]> {
    const page = await readRecords(sdk, {
      report_name: report,
      field_config: 'custom',
      fields,
      criteria,
      max_records: 200,
    });
    return page.rows;
  }
  let serviceTeams: Promise<string[]> | undefined;
  let staffPromise: Promise<LookupOption | null> | undefined;
  function currentStaff(): Promise<LookupOption | null> {
    staffPromise ??= (async () => {
      if (typeof init.loginUser !== 'string' || !init.loginUser)
        throw new CreatorError('Creator did not supply the signed-in user.');
      const rows = await records(
        'Staff_List',
        'Staff_name',
        `User_name == ${criteriaString(init.loginUser)}`,
      );
      return rows.length ? parseLookup('staff', rows[0]) : null;
    })().catch((error) => {
      staffPromise = undefined;
      throw error;
    });
    return staffPromise;
  }
  return {
    mode: 'live',
    currentStaff,
    async serialDetails(serial) {
      if (!serial.trim()) return null;
      const value = criteriaString(serial.trim());
      const rows = await records(
        'Inverter_raw_data_Report',
        'Product_Code,Model,Version',
        `(Serial_Number == ${value}) || (Linked_SN == ${value})`,
      );
      if (!rows.length) return null;
      const raw = rows[0];
      if (
        !Object.hasOwn(raw, 'Product_Code') ||
        !Object.hasOwn(raw, 'Model') ||
        !Object.hasOwn(raw, 'Version')
      )
        throw new CreatorError(
          'The inverter raw data report must expose Product_Code, Model, and Version.',
        );
      const code = display(raw.Product_Code);
      const models = code
        ? await records(
            'Product_Model_List',
            'Description,Product_Code',
            `Product_Code == ${criteriaString(code)}`,
          )
        : [];
      return {
        code,
        model: display(raw.Version) || display(raw.Model),
        product: models.length ? parseLookup('products', models[0]) : null,
      };
    },
    async checkTickets(rows) {
      const errors: Errors = {};
      for (const [i, row] of rows.entries()) {
        const staff = Array.isArray(row.values.Staff) ? row.values.Staff : [];
        if (!staff.length) continue;
        // ^ and $ anchor the entire ID; \d+ requires one or more decimal digits.
        if (staff.some((s) => !/^\d+$/.test(s.id)))
          throw new CreatorError('Select valid staff before checking availability.');
        const staffCriteria = staff.map((s) => `Staff.contains(${s.id})`).join(' || ');
        for (const field of ['Start_Time', 'Aimed_End_Time'] as const) {
          const value = row.values[field];
          if (typeof value !== 'string' || !value) continue;
          // Date/time criteria require single quotes; creatorDateTime validates the literal first.
          const time = "'" + creatorDateTime(value) + "'";
          const endpoint =
            field === 'Start_Time'
              ? `Start_Time <= ${time} && Aimed_End_Time > ${time}`
              : `Start_Time < ${time} && Aimed_End_Time >= ${time}`;
          const found = await records(
            'Service_Ticket_List',
            'Subject_field,Start_Time,Aimed_End_Time',
            `(Status == "Pending") && (${staffCriteria}) && (${endpoint})`,
          );
          if (found.length)
            errors[`Service_Tickets.${i}.${field}`] =
              `Selected staff already have a pending ticket at this time${display(found[0].Subject_field) ? ': ' + display(found[0].Subject_field) : '.'}`;
        }
      }
      return errors;
    },
    async lookup(source, query, clientId, cursor) {
      const def = SOURCES[source];
      const clauses = query.trim()
        ? [`${def.field}.contains(${criteriaString(query.trim())})`]
        : [];
      if (source === 'sites') {
        if (!clientId) return { options: [] };
        // ^ and $ anchor the entire ID; \d+ requires one or more decimal digits.
        if (!/^\d+$/.test(clientId)) throw new CreatorError('Select a valid client.');
        clauses.push(`Client == ${clientId}`);
      }
      if (source === 'engineers') {
        // API lookup criteria use record IDs, so resolve the native Team.Team filter first.
        serviceTeams ??= records('Teams', 'Team', 'Team.contains("Service")')
          .then((rows) => {
            if (rows.length >= 200)
              throw new CreatorError(
                'The Service team lookup returned too many teams to filter reliably.',
              );
            return rows.map((row) => parseLookup('teams', row).id);
          })
          .catch((error) => {
            serviceTeams = undefined;
            throw error;
          });
        const ids = await serviceTeams;
        if (!ids.length) return { options: [] };
        clauses.push(
          `(${ids.map((id) => `Team == ${id}`).join(' || ')}) && Location == "Australia"`,
        );
      }
      if (source === 'rectifications') clauses.push('Rectification_Project != null');
      if (source === 'products') clauses.push('Description != "Write in Remark"');
      const page = await readRecords(sdk, {
        report_name: def.report,
        field_config: 'custom',
        fields: 'fields' in def ? def.fields : def.field,
        max_records: LOOKUP_PAGE_SIZE,
        ...(clauses.length ? { criteria: clauses.map((c) => `(${c})`).join(' && ') } : {}),
        ...(cursor ? { record_cursor: cursor } : {}),
      });
      return {
        options: page.rows
          .filter((row) => !hasBlankLookupLabel(source, row))
          .map((row) => parseLookup(source, row)),
        ...(page.cursor ? { cursor: page.cursor } : {}),
      };
    },
    async create(data) {
      // On-add-row workflows do not run through Add Records. Preserve their Created_By value.
      if (Array.isArray(data.Service_Tickets) && data.Service_Tickets.length) {
        const staff = await currentStaff();
        if (staff)
          data = {
            ...data,
            Service_Tickets: data.Service_Tickets.map((row) => ({
              ...asObject(row),
              Created_By: staff.id,
            })),
          };
      }
      // Preserve on-validate/on-success and schedules. Do not send skip_workflow.
      let response: unknown;
      try {
        response = await timeout(
          sdk.DATA.addRecords({
            form_name: 'Project',
            payload: { data, result: { fields: ['Project_ID'], message: true } },
          }),
          45000,
        );
      } catch (error) {
        const body = unwrap(error);
        if (body.code && Number(body.code) !== 3000) throw new CreatorError(messageOf(body));
        throw new CreatorError(
          'The connection ended before creation was confirmed. Check the Project report before submitting again to avoid a duplicate.',
          true,
        );
      }
      return parseCreated(response);
    },
    async openProject(id) {
      // ^ and $ anchor the entire ID; \d+ requires one or more decimal digits.
      if (!/^\d+$/.test(id)) throw new CreatorError('Invalid project record ID.');
      await sdk.UTIL.navigateParentURL({
        action: 'open',
        url: `#Report:Project_Report?recLinkID=${encodeURIComponent(id)}&viewLinkName=Project_Report`,
        window: 'new',
      });
    },
    async openForm(form, values = {}) {
      const query = new URLSearchParams(values).toString();
      await sdk.UTIL.navigateParentURL({
        action: 'open',
        url: `#Form:${form}${query ? '?' + query : ''}`,
        window: 'new',
      });
    },
  };
}
