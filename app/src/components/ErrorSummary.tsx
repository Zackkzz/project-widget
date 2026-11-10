import type { ErrorSummaryProps } from './types/error-summary.types';
import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleAlert } from 'lucide-react';

const rowLabels: Record<string, string> = {
  Configuration: 'Equipment',
  PO: 'Purchase order',
  BOM: 'BOM item',
  Service_Requests: 'Service request',
  Warranty_Tickets: 'Warranty ticket',
  Issue_Register: 'Issue',
  Software_Iteration: 'Software change',
  Rectification: 'Rectification',
  Service_Tickets: 'Service ticket',
};

/** Use the rendered field labels so shortcuts stay in sync with individual editors. */
export function ErrorSummary({ errors }: ErrorSummaryProps) {
  const summary = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const keys = Object.keys(errors);
  useLayoutEffect(() => {
    const form = summary.current?.closest('form');
    // \s* allows surrounding whitespace, \* matches the required-field marker,
    // and $ restricts removal to the label's end, preserving other asterisks.
    const fieldLabels = new Map(
      Array.from(form?.querySelectorAll('label[for]') ?? []).map((label) => [
        label.getAttribute('for'),
        label.textContent?.replace(/\s*\*\s*$/, '').trim() ?? '',
      ]),
    );
    setLabels(
      Object.fromEntries(
        Object.keys(errors).map((key) => {
          const [section, index, field] = key.split('.');
          const label = fieldLabels.get(key) || (field || section).replaceAll('_', ' ');
          return [
            key,
            field
              ? `${rowLabels[section] || section} ${Number(index) + 1} · ${label}`
              : section === 'PO'
                ? 'Purchase orders'
                : label,
          ];
        }),
      ),
    );
  }, [errors]);

  function focusField(key: string) {
    const target = document.getElementById(key);
    if (!target) return;
    let parent = target.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    const control = target.matches('input, select, textarea, button')
      ? target
      : target.querySelector<HTMLElement>('input, select, textarea, button') || target;
    control.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
  }

  if (!keys.length) return null;
  return (
    <div className="error-summary" ref={summary} role="alert">
      <div className="error-summary-heading">
        <CircleAlert size={18} aria-hidden="true" />
        <strong>
          {keys.length} {keys.length === 1 ? 'field needs' : 'fields need'} attention
        </strong>
      </div>
      <div className="error-shortcuts">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className="error-shortcut"
            onClick={() => focusField(key)}
          >
            <span>{labels[key] || key.replaceAll('_', ' ')}</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
