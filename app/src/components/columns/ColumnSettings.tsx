import type * as ReactTypes from 'react';
import type { createPortal as Portal } from 'react-dom';

type Column = { name: string; label: string };
type Props = {
  columns: Column[];
  selected?: string[];
  order: string[];
  loading?: boolean;
  saving?: boolean;
  error?: string;
  onApply: (selected: string[], order: string[]) => void;
  onRetry: () => void;
};
type Preferences = {
  normalizeSelection: (names: string[]) => string[];
  normalizeOrder: (names: string[]) => string[];
  defaults: string[];
};

/** Preview and commit share the same insertion rule, including the fixed first column. */
export function reorderColumns(order: string[], name: string | null, destination: string | null) {
  if (
    !name ||
    !destination ||
    name === 'Project_Name' ||
    destination === 'Project_Name' ||
    name === destination ||
    !order.includes(name) ||
    !order.includes(destination)
  )
    return order;
  const next = order.filter((value) => value !== name);
  next.splice(order.indexOf(destination), 0, name);
  return next;
}

/** Uses the host React instance so the preserved widget keeps a single hook dispatcher. */
export function createColumnSettings(
  React: typeof ReactTypes,
  createPortal: typeof Portal,
  Columns: ReactTypes.ElementType,
  preferences: Preferences,
) {
  function Icon({ name }: { name: string }) {
    return (
      <img
        src={`./assets/column-settings/${name}.svg`}
        width={16}
        height={16}
        alt=""
        aria-hidden="true"
      />
    );
  }
  return function ColumnSettings({
    columns,
    selected,
    order,
    loading,
    saving,
    error,
    onApply,
    onRetry,
  }: Props) {
    const [open, setOpen] = React.useState(false);
    const [shown, setShown] = React.useState<string[]>([]);
    const [sequence, setSequence] = React.useState<string[]>([]);
    const [search, setSearch] = React.useState('');
    const [target, setTarget] = React.useState<string | null>(null);
    const [announcement, announce] = React.useState('');
    const trigger = React.useRef<HTMLButtonElement>(null);
    const dialog = React.useRef<HTMLDialogElement>(null);
    const list = React.useRef<HTMLDivElement>(null);
    const dragged = React.useRef<string | null>(null);
    const previewTarget = React.useRef<string | null>(null);
    const pointerY = React.useRef(0);
    const rowHeight = React.useRef(48);
    const frame = React.useRef(0);
    const edge = React.useRef(0);
    const start = React.useRef(0);
    const last = React.useRef(0);
    const settling = React.useRef(false);
    const dragSession = React.useRef(0);
    const fields = columns.filter((column) => !column.name.includes('.'));
    const lookup = new Map(fields.map((field) => [field.name, field]));
    const visible = sequence.filter((name) => shown.includes(name) && lookup.has(name));
    const hidden = fields
      .filter((field) => !shown.includes(field.name))
      .sort((a, b) => a.label.localeCompare(b.label));
    const displayed = [...visible, ...hidden.map((field) => field.name)].filter((name) =>
      lookup.get(name)?.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    );
    const preview = reorderColumns(sequence, dragged.current, target);
    const previewVisible = preview.filter((name) => shown.includes(name) && lookup.has(name));
    const previewDisplayed = reorderColumns(displayed, dragged.current, target);
    function previewAtPointer() {
      if (!list.current || !dragged.current) return;
      const offset =
        pointerY.current - list.current.getBoundingClientRect().top + list.current.scrollTop;
      const index = Math.floor(offset / rowHeight.current);
      const previous = displayed.indexOf(previewTarget.current ?? '');
      // A small dead zone prevents trackpad/pointer noise from reversing a move at a row boundary.
      if (
        previous >= 0 &&
        ((index > previous && offset < index * rowHeight.current + 6) ||
          (index < previous && offset > (index + 1) * rowHeight.current - 6))
      )
        return;
      const candidate = displayed[Math.max(0, Math.min(index, displayed.length - 1))];
      const movable = displayed.filter((name) => name !== 'Project_Name' && shown.includes(name));
      const next =
        candidate === 'Project_Name'
          ? movable[0]
          : shown.includes(candidate)
            ? candidate
            : movable.at(-1);
      if (previewTarget.current !== (next ?? null)) {
        previewTarget.current = next ?? null;
        setTarget(next ?? null);
      }
    }
    function stopDrag() {
      dragSession.current++;
      settling.current = false;
      dragged.current = null;
      previewTarget.current = null;
      setTarget(null);
      edge.current = 0;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      start.current = 0;
      last.current = 0;
    }
    async function finishDrag(commit: boolean) {
      if (settling.current || !dragged.current) return;
      settling.current = true;
      const session = dragSession.current,
        name = dragged.current,
        destination = previewTarget.current;
      edge.current = 0;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (!commit) {
        // Animate back to the original slots without removing the transition class mid-flight.
        previewTarget.current = name;
        setTarget(name);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (session !== dragSession.current) return;
      await Promise.all(
        (list.current?.getAnimations?.({ subtree: true }) ?? []).map((animation) =>
          animation.finished.catch(() => {}),
        ),
      );
      if (session !== dragSession.current) return;
      if (commit && destination) move(name, destination);
      // Sequence and transforms reset together after the preview reaches its final pixels.
      stopDrag();
    }
    function close() {
      stopDrag();
      dialog.current?.close();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    }
    React.useEffect(() => {
      if (!open) return;
      dialog.current?.showModal();
      const stop = () => {
        edge.current = 0;
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      };
      window.addEventListener('blur', stop);
      return () => {
        dragSession.current++;
        dialog.current?.close();
        stop();
        window.removeEventListener('blur', stop);
      };
    }, [open]);
    function move(name: string, destination: string) {
      if (name === 'Project_Name' || destination === 'Project_Name' || name === destination) return;
      setSequence((current) => reorderColumns(current, name, destination));
      announce(`${lookup.get(name)?.label} moved.`);
    }
    function toggle(name: string, checked: boolean) {
      if (name === 'Project_Name') return;
      setShown((current) =>
        checked ? [...current, name] : current.filter((value) => value !== name),
      );
      if (checked) setSequence((current) => [...current.filter((value) => value !== name), name]);
    }
    function autoScroll(event: ReactTypes.DragEvent<HTMLDivElement>) {
      if (!dragged.current || !list.current || settling.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      pointerY.current = event.clientY;
      previewAtPointer();
      const bounds = list.current.getBoundingClientRect();
      const direction =
        event.clientY < bounds.top + 44 ? -1 : event.clientY > bounds.bottom - 44 ? 1 : 0;
      if (direction !== edge.current) {
        start.current = 0;
        last.current = 0;
      }
      edge.current = direction;
      if (!direction) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        return;
      }
      if (frame.current) return;
      function tick(time: number) {
        if (!edge.current || !dragged.current || !list.current) {
          frame.current = 0;
          return;
        }
        start.current ||= time;
        const elapsed = last.current ? Math.min(time - last.current, 40) : 16;
        last.current = time;
        const speed = 80 + 320 * Math.min((time - start.current) / 1500, 1);
        list.current.scrollTop += (edge.current * speed * elapsed) / 1000;
        previewAtPointer();
        frame.current = requestAnimationFrame(tick);
      }
      frame.current = requestAnimationFrame(tick);
    }
    return (
      <>
        <button
          ref={trigger}
          type="button"
          className="button secondary field-picker-trigger"
          aria-label="Choose fields"
          title="Choose fields"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={loading || saving}
          onClick={() => {
            setShown(preferences.normalizeSelection(selected ?? fields.map((field) => field.name)));
            setSequence(preferences.normalizeOrder(order));
            setSearch('');
            announce('');
            setOpen(true);
          }}
        >
          <Columns size={18} aria-hidden="true" />
        </button>
        {error && !open && (
          <span className="field-preference-error" role="alert">
            {error}{' '}
            <button type="button" className="button text small" onClick={onRetry}>
              Retry preferences
            </button>
          </span>
        )}
        {open &&
          createPortal(
            <dialog
              ref={dialog}
              className="column-settings"
              aria-labelledby="column-settings-title"
              onCancel={(event) => {
                event.preventDefault();
                close();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            >
              <header className="column-settings-header">
                <h2 id="column-settings-title">Choose and arrange columns</h2>
                <button
                  className="column-icon"
                  type="button"
                  aria-label="Close field selection"
                  title="Close"
                  onClick={close}
                >
                  <Icon name="close" />
                </button>
              </header>
              <div className="column-settings-controls">
                <div className="column-search">
                  <Icon name="search" />
                  <input
                    type="search"
                    aria-label="Search fields"
                    placeholder="Search fields"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    autoFocus
                  />
                </div>
                <div className="column-settings-tools">
                  <div>
                    <button
                      className="button text small"
                      type="button"
                      onClick={() => setShown(fields.map((field) => field.name))}
                    >
                      Select all
                    </button>
                    <button
                      className="button text small"
                      type="button"
                      onClick={() => setShown(['Project_Name'])}
                    >
                      Clear
                    </button>
                    <button
                      className="button text small"
                      type="button"
                      onClick={() =>
                        setShown(preferences.defaults.filter((name) => lookup.has(name)))
                      }
                    >
                      Reset to default
                    </button>
                  </div>
                  <span>{visible.length} shown</span>
                </div>
              </div>
              <div className="column-list-heading">
                <span>Display order</span>
                <span>Visibility</span>
              </div>
              <div
                ref={list}
                className="column-settings-list"
                role="region"
                aria-label="Column visibility and display order"
                onDragOver={autoScroll}
                onDragLeave={(event) => {
                  // Native dragleave also bubbles from moving rows and their SVGs. Keep the
                  // preview until drop/cancel; only pause edge scrolling on a real list exit.
                  const bounds = event.currentTarget.getBoundingClientRect();
                  if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                  )
                    edge.current = 0;
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void finishDrag(true);
                }}
              >
                {displayed.map((name) => {
                  const field = lookup.get(name)!;
                  const index = previewVisible.indexOf(name),
                    checked = index >= 0,
                    fixed = name === 'Project_Name';
                  return (
                    <div
                      key={name}
                      className={`column-setting-row${checked ? '' : ' is-hidden'}${dragged.current && target ? ' is-previewing' : ''}${dragged.current === name ? ' is-dragged' : ''}`}
                      data-column={name}
                      data-position={checked ? index + 1 : undefined}
                      style={
                        dragged.current && target
                          ? {
                              transform: `translateY(${(previewDisplayed.indexOf(name) - displayed.indexOf(name)) * rowHeight.current}px)`,
                            }
                          : undefined
                      }
                    >
                      <button
                        className="column-icon column-grip"
                        type="button"
                        aria-label={`Drag ${field.label}`}
                        title="Drag to reorder; use arrow keys to move"
                        disabled={!checked || fixed}
                        draggable={checked && !fixed}
                        onDragStart={(event) => {
                          if (settling.current) {
                            event.preventDefault();
                            return;
                          }
                          dragSession.current++;
                          dragged.current = name;
                          rowHeight.current =
                            event.currentTarget
                              .closest('.column-setting-row')
                              ?.getBoundingClientRect().height ?? 48;
                          previewTarget.current = name;
                          setTarget(name);
                          event.dataTransfer.setData('text/plain', name);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          if (!settling.current) void finishDrag(false);
                        }}
                        onKeyDown={(event) => {
                          if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                          event.preventDefault();
                          const next = event.key === 'ArrowUp' ? index - 1 : index + 1;
                          if (next > 0 && next < visible.length) move(name, visible[next]);
                        }}
                      >
                        <Icon name={!checked || fixed ? 'grip-disabled' : 'grip'} />
                      </button>
                      <input
                        id={`column-visible-${name}`}
                        type="checkbox"
                        aria-label={`Show ${field.label}`}
                        checked={checked}
                        disabled={fixed}
                        onChange={(event) => toggle(name, event.target.checked)}
                      />
                      <span className="column-position">{checked ? index + 1 : ''}</span>
                      <label htmlFor={`column-visible-${name}`} title={field.label}>
                        {field.label}
                      </label>
                      {fixed || !checked ? (
                        <span className="column-row-status">{fixed ? 'Fixed' : 'Hidden'}</span>
                      ) : (
                        <div className="column-move-actions">
                          <button
                            className="column-icon"
                            type="button"
                            aria-label={`Move ${field.label} up`}
                            title="Move up"
                            disabled={index <= 1}
                            onClick={() => move(name, visible[index - 1])}
                          >
                            <Icon name={index <= 1 ? 'up-disabled' : 'up'} />
                          </button>
                          <button
                            className="column-icon"
                            type="button"
                            aria-label={`Move ${field.label} down`}
                            title="Move down"
                            disabled={index === visible.length - 1}
                            onClick={() => move(name, visible[index + 1])}
                          >
                            <Icon name={index === visible.length - 1 ? 'down-disabled' : 'down'} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!displayed.length && <p className="column-settings-empty">No fields found.</p>}
              </div>
              <span className="column-settings-announcement" role="status">
                {announcement}
              </span>
              {error && (
                <p className="column-settings-error" role="alert">
                  {error}
                </p>
              )}
              <footer className="column-settings-footer">
                <span>Drag visible fields to reorder</span>
                <div>
                  <button className="button secondary small" type="button" onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="button primary small"
                    type="button"
                    disabled={saving || !!dragged.current}
                    onClick={() => {
                      onApply(shown, sequence);
                      close();
                    }}
                  >
                    Apply
                  </button>
                </div>
              </footer>
            </dialog>,
            document.body,
          )}
      </>
    );
  };
}
