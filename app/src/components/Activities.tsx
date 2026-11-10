import type {
  ActivityEditorProps,
  ActivitySectionProps,
  ActivityReviewProps,
} from './types/activities.types';
import type { ActivityValue } from '../domain/types/activities.types';
import type { FormProps } from './types/equipment.types';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ACTIVITIES,
  activityFields,
  activityDisplay,
  changeActivity,
  newActivity,
  rectification,
  selected,
} from '../domain/activities';
import { TextField, TextArea, SelectField, Section } from './Fields';
import { Lookup, MultiLookup } from './Lookup';
import { messageOf } from '../services/creator';

function ActivityEditor({ definition: def, row, index, change, ...props }: ActivityEditorProps) {
  const { draft, errors, gateway } = props;
  const [serialMessage, setSerialMessage] = useState('');
  const [finding, setFinding] = useState(false);
  const latest = useRef({ row, change });
  latest.current = { row, change };
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const update = (field: string, value: ActivityValue) => change(changeActivity(row, field, value));
  async function findSerial() {
    const serial = String(row.values.Serial_Number || '').trim();
    const attempt = ++request.current;
    if (!serial) {
      setFinding(false);
      setSerialMessage('');
      return;
    }
    setFinding(true);
    setSerialMessage('');
    const original = { code: row.values.Product_Code, model: row.values.Product_Model };
    try {
      const found = await gateway.serialDetails(serial);
      if (attempt !== request.current) return;
      if (String(latest.current.row.values.Serial_Number).trim() !== serial) return;
      if (found) {
        const current = latest.current.row;
        latest.current.change({
          ...current,
          values: {
            ...current.values,
            Product_Code:
              current.values.Product_Code === original.code
                ? found.code
                : current.values.Product_Code,
            Product_Model:
              current.values.Product_Model === original.model
                ? found.model
                : current.values.Product_Model,
          },
        });
        setSerialMessage('Product details found.');
      } else setSerialMessage('Serial number not found. Enter product details manually if known.');
    } catch (error) {
      if (attempt === request.current) setSerialMessage(messageOf(error));
    } finally {
      if (attempt === request.current) setFinding(false);
    }
  }
  const meta = rectification(row);
  return (
    <>
      {meta && (
        <p className="hint">
          {meta.type} · {meta.productLine.label}
        </p>
      )}
      <div className="fields">
        {activityFields(def, row, draft).map((field) => {
          const name = `${def.name}.${index}.${field.name}`;
          const common = { name, label: field.label, required: field.required, errors };
          const value = row.values[field.name];
          if (field.type === 'lookup')
            return (
              <Lookup
                key={name}
                {...common}
                source={field.source!}
                value={selected(value)}
                onChange={(v) => update(field.name, v)}
                gateway={gateway}
              />
            );
          if (field.type === 'multi')
            return (
              <MultiLookup
                key={name}
                {...common}
                source={field.source!}
                values={Array.isArray(value) ? value : []}
                onChange={(v) => update(field.name, v)}
                gateway={gateway}
              />
            );
          if (field.type === 'select') {
            if (
              def.name === 'Service_Tickets' &&
              field.name === 'Status' &&
              row.values.Aimed_End_Time
            )
              return (
                <TextField
                  key={name}
                  {...common}
                  value={String(value || '')}
                  onChange={() => {}}
                  readOnly
                  hint="Set from the aimed end time, following the existing workflow."
                />
              );
            return (
              <SelectField
                key={name}
                {...common}
                value={String(value || '')}
                onChange={(v) => update(field.name, v)}
                options={field.options ?? []}
                hint={field.hint}
              />
            );
          }
          if (field.type === 'textarea')
            return (
              <TextArea
                key={name}
                {...common}
                value={String(value || '')}
                onChange={(v) => update(field.name, v)}
              />
            );
          return (
            <TextField
              key={name}
              {...common}
              type={field.type}
              value={String(value || '')}
              onChange={(v) => update(field.name, v)}
              hint={field.hint}
              onBlur={field.name === 'Serial_Number' ? () => void findSerial() : undefined}
            />
          );
        })}
      </div>
      {(finding || serialMessage) && (
        <p className="hint" role="status">
          {finding ? 'Finding serial number…' : serialMessage}
        </p>
      )}
    </>
  );
}
function ActivitySection(props: ActivitySectionProps) {
  const { definition: def, draft, set, errors } = props;
  const rows = draft[def.name];
  const [open, setOpen] = useState(rows.length > 0);
  const hasErrors = Object.keys(errors).some((key) => key.startsWith(def.name + '.'));
  const latest = useRef(rows);
  latest.current = rows;
  return (
    <details
      className="activity-section"
      open={open || hasErrors}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {def.title}
        <span>{rows.length ? `${rows.length} added` : 'Optional'}</span>
      </summary>
      <Section
        title={def.title}
        description={def.description}
        action={
          <button
            type="button"
            className="button secondary small"
            onClick={() => set(def.name, [...rows, newActivity(def)])}
          >
            <Plus size={15} />
            Add {def.singular}
          </button>
        }
      >
        {rows.length === 0 && <p className="hint">No {def.title.toLowerCase()} added.</p>}
        {rows.map((row, index) => (
          <div className="row-card" key={row.key}>
            <div className="row-head">
              <span>
                {def.singular.charAt(0).toUpperCase() + def.singular.slice(1)} {index + 1}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${def.singular} ${index + 1}`}
                onClick={() =>
                  set(
                    def.name,
                    rows.filter((r) => r.key !== row.key),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <ActivityEditor
              {...props}
              row={row}
              index={index}
              change={(next) =>
                set(
                  def.name,
                  latest.current.map((r) => (r.key === row.key ? next : r)),
                )
              }
            />
          </div>
        ))}
      </Section>
    </details>
  );
}
export function Activities(props: FormProps) {
  return (
    <div className="activities">
      <h3>Project activities</h3>
      <p className="hint">Add any activities you already know about, or continue without them.</p>
      {ACTIVITIES.map((def) => (
        <ActivitySection key={def.name} {...props} definition={def} />
      ))}
    </div>
  );
}
export function ActivityReview({ draft }: ActivityReviewProps) {
  return (
    <>
      {ACTIVITIES.filter((def) => draft[def.name].length).map((def) => (
        <div className="review-list" key={def.name}>
          <h4>{def.title}</h4>
          {draft[def.name].map((row, i) => (
            <div key={row.key}>
              <strong>
                {def.singular.charAt(0).toUpperCase() + def.singular.slice(1)} {i + 1}
              </strong>
              <dl className="review-grid">
                {activityFields(def, row, draft)
                  .filter((field) => activityDisplay(row.values[field.name]))
                  .map((field) => (
                    <div className="review-row" key={field.name}>
                      <dt>{field.label}</dt>
                      <dd className="preserve-lines">{activityDisplay(row.values[field.name])}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
