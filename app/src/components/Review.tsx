import type { ReviewProps } from './types/review.types';
import { ActivityReview } from './Activities';
import type { ReactNode } from 'react';
import { Pencil, CheckCircle2 } from 'lucide-react';
import { Section } from './Fields';
import { hasCommissionDate, hasWarranty, isChannel } from '../domain/project';
export function Review({ draft: d, edit }: ReviewProps) {
  const date = (v: string) =>
    v
      ? new Date(v + 'T00:00:00').toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : 'Not provided';
  const row = (label: string, value: ReactNode) => (
    <div className="review-row" key={label}>
      <dt>{label}</dt>
      <dd>{value || 'Not provided'}</dd>
    </div>
  );
  const action = (step: number) => (
    <button type="button" className="button text small" onClick={() => edit(step)}>
      <Pencil size={14} />
      Edit
    </button>
  );
  return (
    <>
      <div className="review-intro">
        <CheckCircle2 size={21} />
        <div>
          <strong>Ready for a final check</strong>
          <p>Review the details below before creating your project.</p>
        </div>
      </div>
      <Section title="Project details" action={action(0)}>
        <dl className="review-grid">
          {row('Project name', d.Project_Name)}
          {row('Project type', d.Project_Type)}
          {row('Status', d.Status)}
          {row('Scenario', d.Scenario.join(', '))}
          {row('Coupling type', d.Coupling_Type)}
          {!isChannel(d.Project_Type) && row('Product line', d.Product_Line)}
          {!isChannel(d.Project_Type) && row('BX code', d.BX_Code)}
          {row('Project ID', 'Assigned after creation')}
        </dl>
      </Section>
      <Section title="Client & site" action={action(1)}>
        <dl className="review-grid">
          {row('Client', d.Client?.label)}
          {row('Site', d.Site?.label)}
          {row('Country', d.Country?.label)}
          {d.Country?.states?.length ? row('State', d.State) : null}
          {row('Project manager', d.Project_Manager?.label)}
          {row('Sales', d.Sales?.label)}
          {row('Distributor', d.Distributor?.label)}
          {row('C4', d.C4.map((v) => v.label).join(', '))}
          {row('Stakeholders', d.Stakeholders)}
        </dl>
      </Section>
      <Section title="Equipment & dates" action={action(2)}>
        <dl className="review-grid">
          {row('PCS capacity', `${d.PCS_Capacity || 0} MW`)}
          {row('BESS capacity', `${d.BESS_Capacity || 0} MWh`)}
          {row('Inverter capacity', `${d.Inverter_Capacity || 0} MW`)}
          {!isChannel(d.Project_Type) && row('EXW factory date', date(d.EXW_Factory_Date))}
          {!isChannel(d.Project_Type) && d.EXW_Factory_Date
            ? row('Estimated commission date', date(d.Estimated_Commission_Date))
            : null}
          {hasCommissionDate(d.Status) &&
            row('Commission complete date', date(d.Commission_Complete_Date))}
          {hasWarranty(d.Status) &&
            row('Warranty commencement', date(d.Warranty_Commencement_Date))}
          {hasWarranty(d.Status) && row('Warranty end', date(d.Warranty_End_Date))}
        </dl>
        {d.Configuration.length > 0 && (
          <div className="review-list">
            <h4>Equipment configuration</h4>
            {d.Configuration.map((r) => (
              <p key={r.key}>
                {r.Model?.label} <span>× {r.Number}</span>
              </p>
            ))}
          </div>
        )}
        {d.PO.length > 0 && (
          <div className="review-list">
            <h4>Purchase orders</h4>
            {d.PO.map((r) => (
              <div key={r.key}>
                <strong>{r.PO_Number}</strong>
                <p>
                  {date(r.Date_field)}
                  {r.Amount
                    ? ` · AUD ${Number(r.Amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                    : ''}
                </p>
                <p>
                  {[r.C4_Number && `C4: ${r.C4_Number}`, r.PO_Type, r.Payment_Status, r.Status]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}
        {d.BOM.length > 0 && (
          <div className="review-list">
            <h4>Bill of materials</h4>
            {d.BOM.map((r) => (
              <div key={r.key}>
                <strong>
                  {r.Original_Product_Model?.label} × {r.Original_Quantity}
                </strong>
                <p>
                  {r.Original_SN ? `SN: ${r.Original_SN}` : 'No serial number'}
                  {r.Warranty_Type ? ` · ${r.Warranty_Type.label}` : ''}
                </p>
                {(r.Warranty_Start_Date || r.Warranty_End_Date) && (
                  <p>
                    {date(r.Warranty_Start_Date)} – {date(r.Warranty_End_Date)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {isChannel(d.Project_Type) && d.Service_Requests.length > 0 && (
          <div className="review-list">
            <h4>Service requests</h4>
            {d.Service_Requests.map((r) => (
              <div key={r.key}>
                <strong>{r.Subject_field}</strong>
                <p>
                  {r.Staff.map((s) => s.label).join(', ')} · {r.Type_field?.label}
                </p>
                <p>
                  {r.Service_Type} · {r.External_or_Internal} · {r.Status}
                </p>
                {r.External_Reference && <p>External reference: {r.External_Reference}</p>}
                <p>Address: {r.Address || 'Online'}</p>
                {r.Start_Date && <p>Start: {date(r.Start_Date)}</p>}
                {r.Close_Date && <p>Closed: {date(r.Close_Date)}</p>}
                {r.Job_Description && <p>{r.Job_Description}</p>}
              </div>
            ))}
          </div>
        )}
        {!isChannel(d.Project_Type) && <ActivityReview draft={d} />}
        {d.Project_Notes && (
          <div className="review-list">
            <h4>Project notes</h4>
            <p className="preserve-lines">{d.Project_Notes}</p>
          </div>
        )}
      </Section>
    </>
  );
}
