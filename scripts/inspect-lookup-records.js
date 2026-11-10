// Paste this script into DevTools Console with the signed-in widget frame selected.
// It only reads reports: no records, settings, or workflows are modified.
(async () => {
  const sdk = window.ZOHO?.CREATOR;
  if (!sdk?.DATA?.getRecords) {
    throw new Error('Select the widget frame in DevTools Console, then run this script again.');
  }

  const reports = [
    { report: 'Sites', field: 'Site_Address', related: 'Client' },
    { report: 'Project_Managers', field: 'Name', related: 'Staff' },
    { report: 'Sales_List', field: 'Name', related: 'Staff' },
    { report: 'C4_Report', field: 'C4_Number', related: 'Client' },
  ];

  /** Preserve SDK error bodies as well as successful responses. */
  function unwrap(value) {
    if (value && typeof value.responseText === 'string') {
      try {
        return JSON.parse(value.responseText);
      } catch {
        return { message: value.responseText };
      }
    }
    return value?.responseText ?? value ?? {};
  }

  /** Describe actual JSON shapes, distinguishing missing fields, nulls, and empty text. */
  function shape(value) {
    if (value === undefined) return 'missing';
    if (value === null) return 'null';
    if (value === '') return 'string (empty)';
    if (Array.isArray(value)) return { array: value.slice(0, 3).map(shape) };
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
    }
    return typeof value;
  }

  /** Bound each read so a stalled report cannot prevent the remaining reports being inspected. */
  async function read(config) {
    let timer;
    try {
      return unwrap(
        await Promise.race([
          sdk.DATA.getRecords(config),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Read timed out after 20 seconds.')), 20000);
          }),
        ]),
      );
    } catch (error) {
      return unwrap(error);
    } finally {
      clearTimeout(timer);
    }
  }

  const output = [];
  for (const definition of reports) {
    // Compare the report's normal fields with the widget's custom display-field request.
    for (const mode of ['quick_view', 'custom']) {
      const config = {
        report_name: definition.report,
        field_config: mode,
        max_records: 200,
        ...(mode === 'custom' ? { fields: definition.field } : {}),
      };
      const body = await read(config);
      const rows = Array.isArray(body.data) ? body.data : [];
      const fields = ['ID', definition.field, definition.related];
      const result = {
        request: config,
        code: body.code ?? null,
        message: body.message ?? null,
        description: body.description ?? null,
        returnedRecords: rows.length,
        fieldsPresent: [...new Set(rows.flatMap((row) => Object.keys(row)))],
        displayFieldTypes: [
          ...new Set(rows.map((row) => JSON.stringify(shape(row[definition.field])))),
        ],
        missingOrEmptyLabels: rows.filter(
          (row) =>
            row[definition.field] === undefined ||
            row[definition.field] === null ||
            row[definition.field] === '',
        ).length,
        samples: rows.slice(0, 3).map((row) => ({
          values: Object.fromEntries(
            fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]),
          ),
          types: Object.fromEntries(fields.map((field) => [field, shape(row[field])])),
        })),
      };
      output.push(result);
      console.log(`${definition.report} (${mode}):`, result);
    }
  }
  const json = JSON.stringify(output, null, 2);
  console.log('Lookup inspection results:\n' + json);
  return json;
})();
