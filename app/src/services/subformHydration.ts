/** Fetch only absent fields, preserving the project's values, including explicit blanks and nulls. */
export async function hydrateMissingFields(
  row: Record<string, unknown>,
  fields: string[],
  fetchFields: (id: string, fields: string[]) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const missing = [...new Set(fields)].filter(
    (field) => !Object.hasOwn(row, field) || row[field] === undefined,
  );
  if (!missing.length || typeof row.ID !== 'string' || !row.ID) return row;
  const fetched = await fetchFields(row.ID, missing);
  if (fetched.ID !== undefined && fetched.ID !== row.ID)
    throw new Error('Zoho returned a different subform record.');
  return {
    ...row,
    ...Object.fromEntries(
      missing
        .filter((field) => Object.hasOwn(fetched, field))
        .map((field) => [field, fetched[field]]),
    ),
  };
}
