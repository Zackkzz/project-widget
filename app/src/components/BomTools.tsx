import type { FormProps } from './types/equipment.types';
import type { BomRow } from '../domain/types/bom.types';
import { useEffect, useRef, useState } from 'react';
import { batchSerials, bomSummary } from '../domain/bom';
import { rowKey } from '../domain/project';
import { messageOf } from '../services/creator';
import { TextArea } from './Fields';

export function BomTools({ draft, gateway, set }: FormProps) {
  const [batch, setBatch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const latest = useRef(draft.BOM);
  latest.current = draft.BOM;
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function importSerials() {
    const serials = batchSerials(batch);
    setError('');
    setNotice('');
    if (!serials.length) {
      setError('Enter at least one serial number.');
      return;
    }
    if (serials.length > 200) {
      setError('Import up to 200 serial numbers at a time.');
      return;
    }
    setBusy(true);
    const attempt = ++generation.current;
    const rows: BomRow[] = [];
    try {
      // Bound simultaneous report reads. Commit the batch only after every lookup succeeds.
      for (let start = 0; start < serials.length; start += 4) {
        if (attempt !== generation.current) return;
        const chunk = await Promise.all(
          serials.slice(start, start + 4).map(async (serial) => {
            const found = await gateway.serialDetails(serial);
            return {
              key: rowKey(),
              Original_SN: serial,
              Original_Quantity: '1',
              Original_Product_Model: found?.product ?? null,
              Warranty_Type: null,
              Warranty_Start_Date: '',
              Warranty_End_Date: '',
            };
          }),
        );
        rows.push(...chunk);
      }
      if (attempt !== generation.current) return;
      set('BOM', [...latest.current, ...rows]);
      setBatch('');
      const unknown = rows.filter((row) => !row.Original_Product_Model).length;
      setNotice(
        `${rows.length} items added.${unknown ? ` Select a product model for ${unknown} unmatched serial number${unknown === 1 ? '' : 's'} below.` : ''}`,
      );
    } catch (cause) {
      if (attempt === generation.current)
        setError(`${messageOf(cause)} No items from this batch were added.`);
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <details className="bom-tools">
        <summary>Import serial numbers</summary>
        <p className="hint">
          Paste one serial number per line. Product models are matched from existing inverter
          records. Convert the batch to items before continuing.
        </p>
        <fieldset disabled={busy} className="form-fields">
          <TextArea
            name="Batch_SN_Input"
            label="Serial numbers"
            value={batch}
            onChange={setBatch}
            errors={{}}
          />
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={() => void importSerials()}
          >
            {busy ? 'Matching serial numbers…' : 'Add serial numbers to BOM'}
          </button>
        </fieldset>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="hint" role="status">
            {notice}
          </p>
        )}
      </details>
      {draft.BOM.length > 0 && (
        <details className="bom-tools">
          <summary>View totals by model</summary>
          <dl className="review-grid">
            {bomSummary(draft.BOM).map((group) => (
              <div className="review-row" key={group.id}>
                <dt>{group.label}</dt>
                <dd>
                  {group.quantity} units · {group.serials} serial numbers
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}
