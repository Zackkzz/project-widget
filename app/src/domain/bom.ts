import type { BomRow, BomModelTotals } from './types/bom.types';

/** Mirrors the native batch cleanup: one serial per line; remove spaces, tabs and semicolons. */
export function batchSerials(text: string): string[] {
  // [;； \t\r] matches either semicolon, a space, tab, or carriage return; g removes all.
  // Newlines are preserved so each line remains a separate serial number.
  return text
    .replace(/[;； \t\r]/g, '')
    .split('\n')
    .filter(Boolean);
}
export function bomSummary(rows: BomRow[]) {
  const groups = new Map<string, BomModelTotals>();
  for (const row of rows) {
    const key = row.Original_Product_Model?.id ?? 'unassigned';
    const group = groups.get(key) ?? {
      label: row.Original_Product_Model?.label ?? 'Model not selected',
      quantity: 0,
      serials: 0,
    };
    const amount = Number(row.Original_Quantity);
    if (Number.isFinite(amount)) group.quantity += amount;
    if (row.Original_SN.trim()) group.serials++;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
}
