import type { Json } from './types/creator.types';

/** Load software choices from their owning project, rather than a copied child-report field. */
export async function loadRectificationPackages(
  rows: Json[],
  fetchParents: (ids: string[]) => Promise<Json[]>,
): Promise<Json[]> {
  const parentId = (row: Json): string => {
    const link = row.Rectification_Project;
    const id =
      link && typeof link === 'object' && !Array.isArray(link) && 'ID' in link
        ? link.ID
        : undefined;
    // Anchors require the entire ID to contain decimal digits; never convert Creator IDs to numbers.
    if (typeof id !== 'string' || !/^\d+$/.test(id))
      throw new Error('Select a rectification with a valid linked Rectification Project.');
    return id;
  };
  const ids = [...new Set(rows.filter((row) => row.Type_field === 'Software').map(parentId))];
  if (!ids.length) return rows;
  const packages = new Map<string, unknown>();
  for (let index = 0; index < ids.length; index += 25) {
    const batch = ids.slice(index, index + 25);
    const parents = await fetchParents(batch);
    for (const parent of parents) {
      if (
        typeof parent.ID === 'string' &&
        batch.includes(parent.ID) &&
        Object.hasOwn(parent, 'Software_Packages')
      )
        packages.set(parent.ID, parent.Software_Packages);
    }
  }
  return rows.map((row) => {
    if (row.Type_field !== 'Software') return row;
    const id = parentId(row);
    if (!packages.has(id))
      throw new Error(
        'Unable to load Software Packages from the linked Rectification_Projects record. Check report and field access.',
      );
    const value = packages.get(id);
    if (value !== null && value !== '' && !Array.isArray(value))
      throw new Error(
        'The linked Rectification_Projects record returned an unsupported Software Packages format.',
      );
    return { ...row, Software_Packages: Array.isArray(value) ? value : [] };
  });
}
