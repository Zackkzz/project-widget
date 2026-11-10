import type { FormProps, EquipmentFieldName } from './types/equipment.types';
import { useEffect, useRef, useState } from 'react';
import { messageOf } from '../services/creator';
import { BomTools } from './BomTools';
import { Activities } from './Activities';
import { Plus, Trash2, Package, ClipboardList, Wrench, ExternalLink } from 'lucide-react';
import { Section, TextField, SelectField, TextArea } from './Fields';
import { Lookup, MultiLookup } from './Lookup';
import {
  hasCommissionDate,
  hasWarranty,
  isChannel,
  needsPO,
  rowKey,
  SERVICE_TYPES,
} from '../domain/project';

export function Equipment({ draft: d, errors, gateway, set }: FormProps) {
  const [addingRequest, setAddingRequest] = useState(false);
  const [requestError, setRequestError] = useState('');
  const latest = useRef(d);
  latest.current = d;
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function addRequest() {
    setAddingRequest(true);
    setRequestError('');
    try {
      const staff = await gateway.currentStaff();
      if (!active.current) return;
      set('Service_Requests', [
        ...latest.current.Service_Requests,
        {
          key: rowKey(),
          Subject_field: '',
          External_Reference: '',
          Address: 'Online',
          Close_Date: '',
          Staff: staff ? [staff] : [],
          Type_field: null,
          Service_Type: '',
          External_or_Internal: '',
          Start_Date: '',
          Status: 'On-Going',
          Job_Description: '',
        },
      ]);
    } catch (error) {
      if (active.current) setRequestError(messageOf(error));
    } finally {
      if (active.current) setAddingRequest(false);
    }
  }
  const text = (key: EquipmentFieldName, label: string, type: string, hint?: string) => (
    <TextField
      name={key}
      label={label}
      type={type}
      value={d[key]}
      onChange={(v) => set(key, v)}
      errors={errors}
      hint={hint}
      min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? '0.01' : undefined}
    />
  );
  return (
    <>
      <Section
        title="System capacity"
        description="Enter the total installed capacity for this project."
      >
        <div className="fields three">
          {text('PCS_Capacity', 'PCS capacity (MW)', 'number')}
          {text('BESS_Capacity', 'BESS capacity (MWh)', 'number')}
          {text('Inverter_Capacity', 'Inverter capacity (MW)', 'number')}
        </div>
      </Section>
      <Section
        title="Equipment configuration"
        description="List the models and quantities planned for the site."
        action={
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              set('Configuration', [
                ...d.Configuration,
                { key: rowKey(), Model: null, Number: '1' },
              ])
            }
          >
            <Plus size={15} />
            Add equipment
          </button>
        }
      >
        {!d.Configuration.length && (
          <div className="empty-row">
            <Package size={20} />
            <span>No equipment added yet. You can add it now or after creation.</span>
          </div>
        )}
        {d.Configuration.map((row, i) => (
          <div className="row-card" key={row.key}>
            <div className="row-head">
              <span>Equipment {i + 1}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove equipment ${i + 1}`}
                onClick={() =>
                  set(
                    'Configuration',
                    d.Configuration.filter((r) => r.key !== row.key),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="fields">
              <Lookup
                name={`Configuration.${i}.Model`}
                label="Model"
                source="models"
                value={row.Model}
                onChange={(v) =>
                  set(
                    'Configuration',
                    d.Configuration.map((r) => (r.key === row.key ? { ...r, Model: v } : r)),
                  )
                }
                gateway={gateway}
                errors={errors}
                required
              />
              <TextField
                name={`Configuration.${i}.Number`}
                label="Quantity"
                type="number"
                min={1}
                step="1"
                value={row.Number}
                onChange={(v) =>
                  set(
                    'Configuration',
                    d.Configuration.map((r) => (r.key === row.key ? { ...r, Number: v } : r)),
                  )
                }
                errors={errors}
                required
              />
            </div>
          </div>
        ))}
      </Section>
      {(!isChannel(d.Project_Type) || hasCommissionDate(d.Status) || hasWarranty(d.Status)) && (
        <Section
          title="Delivery & warranty"
          description="Dates shown here follow the project type and current status."
        >
          <div className="fields">
            {!isChannel(d.Project_Type) && (
              <>
                {text('EXW_Factory_Date', 'EXW factory date', 'date')}
                {d.EXW_Factory_Date &&
                  text(
                    'Estimated_Commission_Date',
                    'Estimated commission date',
                    'date',
                    d.Project_Type === 'Sub 5MW PV&Storage'
                      ? 'Defaults to four months after the EXW date.'
                      : undefined,
                  )}
              </>
            )}
            {hasCommissionDate(d.Status) &&
              text('Commission_Complete_Date', 'Commission complete date', 'date')}
            {hasWarranty(d.Status) && (
              <>
                {text(
                  'Warranty_Commencement_Date',
                  'Warranty commencement date',
                  'date',
                  'When commissioning changes, uses the earlier of completion and EXW + six months.',
                )}
                {text('Warranty_End_Date', 'Warranty end date', 'date')}
              </>
            )}
          </div>
        </Section>
      )}
      <Section
        title="Purchase orders"
        description={
          needsPO(d.Project_Type)
            ? 'At least one purchase order is required for this project type.'
            : 'Optional for C&I projects.'
        }
        action={
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              set('PO', [
                ...d.PO,
                {
                  key: rowKey(),
                  PO_Number: '',
                  Date_field: '',
                  C4_Number: '',
                  PO_Type: '',
                  Amount: '',
                  Payment_Status: '',
                  Status: '',
                },
              ])
            }
          >
            <Plus size={15} />
            Add purchase order
          </button>
        }
      >
        {errors.PO && (
          <p className="field-error" id="PO" role="alert" tabIndex={-1}>
            {errors.PO}
          </p>
        )}
        {!d.PO.length && (
          <div className="empty-row">
            <ClipboardList size={20} />
            <span>No purchase orders added.</span>
          </div>
        )}
        {d.PO.map((r, i) => {
          const change = (field: keyof typeof r, value: string) =>
            set(
              'PO',
              d.PO.map((row) => (row.key === r.key ? { ...row, [field]: value } : row)),
            );
          return (
            <div className="row-card" key={r.key}>
              <div className="row-head">
                <span>Purchase order {i + 1}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove purchase order ${i + 1}`}
                  onClick={() =>
                    set(
                      'PO',
                      d.PO.filter((row) => row.key !== r.key),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="fields">
                <TextField
                  name={`PO.${i}.PO_Number`}
                  label="PO number"
                  value={r.PO_Number}
                  onChange={(v) => change('PO_Number', v)}
                  errors={errors}
                  required
                />
                <TextField
                  name={`PO.${i}.Date_field`}
                  label="PO date"
                  type="date"
                  value={r.Date_field}
                  onChange={(v) => change('Date_field', v)}
                  errors={errors}
                  required
                />
                <TextField
                  name={`PO.${i}.C4_Number`}
                  label="C4 number"
                  value={r.C4_Number}
                  onChange={(v) => change('C4_Number', v)}
                  errors={errors}
                />
                <SelectField
                  name={`PO.${i}.PO_Type`}
                  label="PO type"
                  value={r.PO_Type}
                  onChange={(v) => change('PO_Type', v)}
                  options={['Product Only', 'Service Only', 'Product + Service', 'Product + OM']}
                  errors={errors}
                />
                <TextField
                  name={`PO.${i}.Amount`}
                  label="Amount (AUD)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.Amount}
                  onChange={(v) => change('Amount', v)}
                  errors={errors}
                />
                <SelectField
                  name={`PO.${i}.Payment_Status`}
                  label="Payment status"
                  value={r.Payment_Status}
                  onChange={(v) => change('Payment_Status', v)}
                  options={['Unpaid', 'Deposit Paid', 'Partially Paid', 'Paid']}
                  errors={errors}
                />
                <SelectField
                  name={`PO.${i}.Status`}
                  label="Order status"
                  value={r.Status}
                  onChange={(v) => change('Status', v)}
                  options={[
                    'Pending Manufacture',
                    'Manufacturing',
                    'In Transit',
                    'On Site',
                    'Commissioning',
                    'Operating',
                    'Pending Collection',
                    'PO Closed',
                  ]}
                  errors={errors}
                />
              </div>
            </div>
          );
        })}
      </Section>
      <Section
        title="Bill of materials"
        description="Add individual items or import a list of serial numbers."
        action={
          <button
            type="button"
            className="button secondary small"
            onClick={() =>
              set('BOM', [
                ...d.BOM,
                {
                  key: rowKey(),
                  Original_Product_Model: null,
                  Original_SN: '',
                  Original_Quantity: '1',
                  Warranty_Type: null,
                  Warranty_Start_Date: '',
                  Warranty_End_Date: '',
                },
              ])
            }
          >
            <Plus size={15} />
            Add BOM item
          </button>
        }
      >
        <BomTools draft={d} gateway={gateway} set={set} errors={errors} />
        {!d.BOM.length && (
          <div className="empty-row">
            <Package size={20} />
            <span>No BOM items added.</span>
          </div>
        )}
        {d.BOM.map((r, i) => {
          function change<K extends keyof typeof r>(field: K, value: (typeof r)[K]) {
            set(
              'BOM',
              d.BOM.map((row) => (row.key === r.key ? { ...row, [field]: value } : row)),
            );
          }
          return (
            <div className="row-card" key={r.key}>
              <div className="row-head">
                <span>BOM item {i + 1}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove BOM item ${i + 1}`}
                  onClick={() =>
                    set(
                      'BOM',
                      d.BOM.filter((row) => row.key !== r.key),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="fields">
                <Lookup
                  name={`BOM.${i}.Original_Product_Model`}
                  label="Product model"
                  source="products"
                  value={r.Original_Product_Model}
                  onChange={(v) => change('Original_Product_Model', v)}
                  gateway={gateway}
                  errors={errors}
                  required
                />
                <TextField
                  name={`BOM.${i}.Original_Quantity`}
                  label="Quantity"
                  type="number"
                  min={1}
                  step="1"
                  value={r.Original_Quantity}
                  onChange={(v) => change('Original_Quantity', v)}
                  errors={errors}
                  required
                />
                <TextField
                  name={`BOM.${i}.Original_SN`}
                  label="Serial number"
                  value={r.Original_SN}
                  onChange={(v) => change('Original_SN', v)}
                  errors={errors}
                />
                <Lookup
                  name={`BOM.${i}.Warranty_Type`}
                  label="Warranty type"
                  source="warranties"
                  value={r.Warranty_Type}
                  onChange={(v) => change('Warranty_Type', v)}
                  gateway={gateway}
                  errors={errors}
                />
                <TextField
                  name={`BOM.${i}.Warranty_Start_Date`}
                  label="Warranty start date"
                  type="date"
                  value={r.Warranty_Start_Date}
                  onChange={(v) => change('Warranty_Start_Date', v)}
                  errors={errors}
                />
                <TextField
                  name={`BOM.${i}.Warranty_End_Date`}
                  label="Warranty end date"
                  type="date"
                  value={r.Warranty_End_Date}
                  onChange={(v) => change('Warranty_End_Date', v)}
                  errors={errors}
                />
              </div>
            </div>
          );
        })}
      </Section>
      {isChannel(d.Project_Type) && (
        <>
          <Section
            title="Service requests"
            description="Assign a team and create requests with the project. Supporting files can be added in Creator after creation."
            action={
              <button
                type="button"
                className="button secondary small"
                disabled={addingRequest}
                onClick={() => void addRequest()}
              >
                <Plus size={15} />
                {addingRequest ? 'Loading staff…' : 'Add request'}
              </button>
            }
          >
            {requestError && (
              <p className="field-error" role="alert">
                {requestError}
              </p>
            )}
            {!d.Service_Requests.length && (
              <div className="empty-row">
                <Wrench size={20} />
                <span>No service requests added.</span>
              </div>
            )}
            {d.Service_Requests.map((r, i) => {
              function change<K extends keyof typeof r>(field: K, value: (typeof r)[K]) {
                set(
                  'Service_Requests',
                  d.Service_Requests.map((row) =>
                    row.key === r.key ? { ...row, [field]: value } : row,
                  ),
                );
              }
              const prefix = `Service_Requests.${i}`;
              return (
                <div className="row-card" key={r.key}>
                  <div className="row-head">
                    <span>Service request {i + 1}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove service request ${i + 1}`}
                      onClick={() =>
                        set(
                          'Service_Requests',
                          d.Service_Requests.filter((row) => row.key !== r.key),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="fields">
                    <TextField
                      name={`${prefix}.Subject_field`}
                      label="Subject"
                      value={r.Subject_field}
                      onChange={(v) => change('Subject_field', v)}
                      errors={errors}
                      required
                      wide
                    />
                    <TextField
                      name={`${prefix}.External_Reference`}
                      label="External reference"
                      value={r.External_Reference}
                      onChange={(v) => change('External_Reference', v)}
                      errors={errors}
                    />
                    <TextField
                      name={`${prefix}.Address`}
                      label="Request address"
                      value={r.Address}
                      onChange={(v) => change('Address', v)}
                      errors={errors}
                      hint="Online, a site address, or another location."
                    />
                    <MultiLookup
                      name={`${prefix}.Staff`}
                      label="Staff"
                      source="staff"
                      values={r.Staff}
                      onChange={(v) => change('Staff', v)}
                      gateway={gateway}
                      errors={errors}
                      required
                    />
                    <Lookup
                      name={`${prefix}.Type_field`}
                      label="Team"
                      source="teams"
                      value={r.Type_field}
                      onChange={(v) => change('Type_field', v)}
                      gateway={gateway}
                      errors={errors}
                      required
                    />
                    <SelectField
                      name={`${prefix}.Service_Type`}
                      label="Service type"
                      value={r.Service_Type}
                      onChange={(v) => change('Service_Type', v)}
                      options={SERVICE_TYPES}
                      errors={errors}
                      required
                    />
                    <SelectField
                      name={`${prefix}.External_or_Internal`}
                      label="External or internal"
                      value={r.External_or_Internal}
                      onChange={(v) => change('External_or_Internal', v)}
                      options={['External', 'Internal']}
                      errors={errors}
                      required
                    />
                    <TextField
                      name={`${prefix}.Start_Date`}
                      label="Start date"
                      type="date"
                      value={r.Start_Date}
                      onChange={(v) => change('Start_Date', v)}
                      errors={errors}
                    />
                    <TextField
                      name={`${prefix}.Close_Date`}
                      label="Close date"
                      type="date"
                      value={r.Close_Date}
                      onChange={(v) => change('Close_Date', v)}
                      errors={errors}
                    />
                    <SelectField
                      name={`${prefix}.Status`}
                      label="Request status"
                      value={r.Status}
                      onChange={(v) => change('Status', v)}
                      options={['On-Going', 'On Hold', 'Closed']}
                      errors={errors}
                      required
                    />
                    <TextArea
                      name={`${prefix}.Job_Description`}
                      label="Job description"
                      value={r.Job_Description}
                      onChange={(v) => change('Job_Description', v)}
                      errors={errors}
                    />
                  </div>
                </div>
              );
            })}
          </Section>
          <div className="info-note">
            <ExternalLink size={18} />
            <div>
              <strong>Milestones are added after creation</strong>
              <p>
                Open the milestone form from the confirmation screen to capture its required
                signature and supporting files.
              </p>
            </div>
          </div>
        </>
      )}
      {!isChannel(d.Project_Type) && (
        <Activities draft={d} errors={errors} gateway={gateway} set={set} />
      )}
      <Section title="Additional notes">
        <div className="fields">
          <TextArea
            name="Project_Notes"
            label="Project notes"
            value={d.Project_Notes}
            onChange={(v) => set('Project_Notes', v)}
            errors={errors}
          />
        </div>
      </Section>
    </>
  );
}
