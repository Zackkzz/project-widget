import type * as React from 'react';
import type { RecoveryDialogProps, RecoveryPanelOptions } from './types/recovery-panel.types';
import { recoveryValue } from './draftRecovery';

const asset = (name: string) => new URL(`./conflict-recovery/${name}.svg`, import.meta.url).href;

/** Native dialog supplies keyboard focus containment and Escape handling without another React copy. */
function RecoveryDialog({ react, options }: RecoveryDialogProps): React.ReactElement {
  const h = react.createElement;
  const ref = react.useRef<HTMLDialogElement>(null);
  const heading = react.useRef<HTMLHeadingElement>(null);
  const id = react.useId();
  react.useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    heading.current?.focus();
    return () => dialog?.close();
  }, []);
  const total = options.conflicts.length;
  const resolved = total - options.unresolved;
  return h(
    'dialog',
    {
      ref,
      className: 'draft-conflict-dialog',
      'aria-labelledby': `${id}-heading`,
      'aria-describedby': `${id}-description`,
      onCancel: (event: React.SyntheticEvent) => {
        event.preventDefault();
        options.closeReview();
      },
    },
    h(
      'header',
      { className: 'draft-dialog-heading' },
      h(
        'div',
        null,
        h(
          'h2',
          { id: `${id}-heading`, ref: heading, tabIndex: -1 },
          `Review ${total} conflicting ${total === 1 ? 'field' : 'fields'}`,
        ),
        h('p', { id: `${id}-description` }, `${options.title} · Your unsaved changes are kept`),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'draft-dialog-close',
          'aria-label': 'Close conflict review',
          onClick: options.closeReview,
        },
        h('img', { src: asset('close'), alt: '', width: 18, height: 18 }),
      ),
    ),
    h(
      'div',
      { className: 'draft-dialog-body' },
      h(
        'div',
        { className: 'draft-merge-status' },
        h(
          'strong',
          null,
          options.automaticCount
            ? `${options.automaticCount} other ${options.automaticCount === 1 ? 'change was' : 'changes were'} carried forward automatically`
            : 'Your other fields are kept',
        ),
        h('p', null, 'Choose which value to keep for each field below.'),
      ),
      h(
        'div',
        { className: 'draft-compare-headings', 'aria-hidden': true },
        h('strong', null, 'Your change'),
        h('strong', null, 'Latest saved value'),
      ),
      ...options.conflicts.map((conflict) =>
        h(
          'fieldset',
          { key: conflict.key, className: 'draft-conflict' },
          h('legend', null, options.label(conflict)),
          h(
            'p',
            { className: 'draft-original-value' },
            `Value when you opened Edit: ${recoveryValue(conflict.before)}`,
          ),
          conflict.deleted &&
            h(
              'p',
              { className: 'draft-removal-note' },
              'This field or row was removed or is no longer available. Copy any information you need before accepting its removal.',
            ),
          h(
            'div',
            { className: 'draft-conflict-values' },
            ...(['mine', 'latest'] as const).map((choice) => {
              const selected = options.choices[conflict.key] === choice;
              const label =
                choice === 'mine'
                  ? 'Keep my change'
                  : conflict.deleted
                    ? 'Accept removal'
                    : 'Use latest value';
              return h(
                'label',
                {
                  key: choice,
                  className: `draft-value-choice${selected ? ' is-selected' : ''}${conflict.deleted && choice === 'mine' ? ' is-unavailable' : ''}`,
                },
                h(
                  'span',
                  { className: 'draft-choice-label' },
                  h('input', {
                    type: 'radio',
                    name: `${id}-${conflict.key}`,
                    checked: selected,
                    disabled: conflict.deleted && choice === 'mine',
                    'aria-label': `${label} for ${options.label(conflict)}`,
                    onChange: () => options.resolve(conflict.key, choice),
                  }),
                  h('img', {
                    src: asset(selected ? 'selected' : 'unselected'),
                    alt: '',
                    width: 18,
                    height: 18,
                  }),
                  label,
                ),
                h(
                  'span',
                  { className: 'draft-choice-value' },
                  recoveryValue(choice === 'mine' ? conflict.mine : conflict.latest),
                ),
              );
            }),
          ),
        ),
      ),
      h(
        'p',
        { className: 'draft-resolution-count', role: 'status' },
        `${resolved} of ${total} ${total === 1 ? 'field' : 'fields'} resolved`,
      ),
    ),
    h(
      'footer',
      { className: 'draft-dialog-footer' },
      h(
        'button',
        { type: 'button', className: 'button secondary small', onClick: options.closeReview },
        'Keep editing',
      ),
      h(
        'span',
        { className: 'draft-resolution-hint' },
        options.unresolved
          ? `Choose a value for ${options.unresolved} remaining ${options.unresolved === 1 ? 'field' : 'fields'}`
          : 'All choices made. Nothing has been saved yet.',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button primary small',
          disabled: options.unresolved > 0,
          onClick: options.finishReview,
        },
        'Review merged changes',
      ),
    ),
  );
}

/** Composes the approved notice, protected comparison dialog, and chosen-value summary. */
export function recoveryPanel(
  react: typeof React,
  options: RecoveryPanelOptions,
): React.ReactElement {
  const h = react.createElement;
  return h(
    react.Fragment,
    null,
    h(
      'section',
      { className: 'draft-recovery', 'aria-label': 'Draft recovery', 'aria-busy': options.busy },
      h(
        'div',
        { className: 'draft-recovery-heading' },
        h(
          'div',
          null,
          h(
            'strong',
            null,
            options.ready ? 'Your draft is ready to save' : 'Your unsaved changes are kept',
          ),
          h('p', { role: 'status' }, options.message),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'button secondary small',
            disabled: options.busy,
            onClick: options.review,
          },
          options.busy
            ? 'Loading latest changes…'
            : options.ready
              ? 'Review changes'
              : 'Review latest changes',
        ),
      ),
      options.ready &&
        options.conflicts.length > 0 &&
        h(
          'dl',
          { className: 'draft-merged-summary' },
          ...options.conflicts.map((conflict) =>
            h(
              'div',
              { key: conflict.key },
              h('dt', null, options.label(conflict)),
              h(
                'dd',
                null,
                recoveryValue(
                  options.choices[conflict.key] === 'latest' ? conflict.latest : conflict.mine,
                ),
              ),
              h(
                'dd',
                { className: 'draft-summary-source' },
                options.choices[conflict.key] === 'latest' ? 'Latest saved value' : 'Your change',
              ),
            ),
          ),
        ),
    ),
    options.open && h(RecoveryDialog, { react, options }),
  );
}
