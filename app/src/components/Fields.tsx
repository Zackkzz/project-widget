import type {
  FieldProps,
  TextFieldProps,
  SelectFieldProps,
  TextAreaProps,
  SectionProps,
} from './types/fields.types';
import { useId } from 'react';

export function Field({ name, label, required, hint, errors, children, wide = false }: FieldProps) {
  return (
    <div className={`field ${wide ? 'wide' : ''}`} data-invalid={Boolean(errors[name])}>
      <label htmlFor={name}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {errors[name] ? (
        <span className="field-error" id={`${name}-error`}>
          {errors[name]}
        </span>
      ) : (
        hint && (
          <span className="hint" id={`${name}-hint`}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
export function TextField({
  name,
  label,
  value,
  onChange,
  errors,
  required,
  hint,
  type = 'text',
  wide,
  readOnly,
  onBlur,
  min,
  step,
}: TextFieldProps) {
  return (
    <Field {...{ name, label, errors, required, hint, wide }}>
      <input
        id={name}
        name={name}
        value={value}
        type={type}
        readOnly={readOnly}
        onBlur={onBlur}
        min={min}
        step={step}
        aria-required={required}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined}
        maxLength={type === 'text' ? 255 : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function SelectField({
  name,
  label,
  value,
  onChange,
  options,
  errors,
  required,
  hint,
}: SelectFieldProps) {
  return (
    <Field {...{ name, label, errors, required, hint }}>
      <select
        id={name}
        name={name}
        value={value}
        aria-required={required}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select an option</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function TextArea({ name, label, value, onChange, errors }: TextAreaProps) {
  return (
    <Field {...{ name, label, errors }} wide>
      <textarea
        id={name}
        name={name}
        value={value}
        rows={3}
        maxLength={64000}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function Section({ title, description, children, action }: SectionProps) {
  const id = useId();
  return (
    <section className="form-section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <h3 id={id}>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
