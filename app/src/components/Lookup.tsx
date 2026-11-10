import type { LookupProps, MultiLookupProps } from './types/lookup.types';
import type { LookupOption } from '../domain/types/lookup.types';
import { LOOKUP_PAGE_SIZE } from '../services/creator';
import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X, LoaderCircle } from 'lucide-react';
import { Field } from './Fields';

import { messageOf } from '../services/creator';
export function Lookup({
  name,
  label,
  source,
  gateway,
  value,
  onChange,
  errors,
  required,
  clientId,
  disabled,
  preload = false,
  hint,
}: LookupProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const [refresh, setRefresh] = useState(0);
  const search = query.trim();
  const shouldLoad = !disabled && (preload || open);
  const sequence = useRef(0),
    wrapper = useRef<HTMLDivElement>(null);
  const loadingMore = useRef<number | null>(null);
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(`${name}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [name, open, active]);
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);
  useEffect(() => {
    // Preloaded fields keep their results on opening; dependency changes invalidate old responses.
    const generation = ++sequence.current;
    loadingMore.current = null;
    setLoading(false);
    setError('');
    setOptions([]);
    setCursor(undefined);
    setActive(-1);
    if (!shouldLoad) return;
    setLoading(true);
    const timer = setTimeout(
      () => {
        gateway
          .lookup(source, search, clientId)
          .then((page) => {
            if (generation === sequence.current) {
              setOptions(page.options);
              setCursor(page.cursor);
            }
          })
          .catch((e) => {
            if (generation === sequence.current) setError(messageOf(e));
          })
          .finally(() => {
            if (generation === sequence.current) setLoading(false);
          });
      },
      search ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      ++sequence.current;
    };
  }, [gateway, source, search, clientId, shouldLoad, refresh]);
  async function more(retry = false) {
    if (
      !open ||
      disabled ||
      !cursor ||
      loading ||
      loadingMore.current === sequence.current ||
      (error && !retry)
    )
      return;
    const generation = sequence.current;
    // Scroll events can arrive before React renders the loading state. Lock immediately.
    loadingMore.current = generation;
    setLoading(true);
    setError('');
    try {
      const page = await gateway.lookup(source, search, clientId, cursor);
      if (generation === sequence.current) {
        setOptions((old) => [...new Map([...old, ...page.options].map((r) => [r.id, r])).values()]);
        setCursor(page.cursor);
      }
    } catch (e) {
      if (generation === sequence.current) setError(messageOf(e));
    } finally {
      if (generation === sequence.current) {
        loadingMore.current = null;
        setLoading(false);
      }
    }
  }
  function choose(option: LookupOption) {
    onChange(option);
    setOpen(false);
    setQuery('');
  }
  return (
    <Field {...{ name, label, errors, required, hint }}>
      <div
        className="lookup"
        ref={wrapper}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
        }}
      >
        <div className="lookup-input">
          <Search size={16} aria-hidden="true" />
          <input
            id={name}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${name}-list`}
            aria-activedescendant={active >= 0 && open ? `${name}-option-${active}` : undefined}
            aria-required={required}
            aria-invalid={Boolean(errors[name])}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
            autoComplete="off"
            disabled={disabled}
            placeholder={disabled ? 'Choose a client first' : `Search ${label.toLowerCase()}`}
            value={open ? query : (value?.label ?? '')}
            onFocus={() => {
              setQuery('');
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                e.stopPropagation();
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(a + 1, options.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (open && active >= 0 && options[active]) choose(options[active]);
              }
            }}
          />
          {value ? (
            <button
              type="button"
              className="icon-button"
              aria-label={`Clear ${label}`}
              disabled={disabled}
              onClick={() => {
                onChange(null);
                setQuery('');
              }}
            >
              <X size={15} />
            </button>
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
        </div>
        {open && !disabled && (
          <div
            className="lookup-menu"
            onScroll={(event) => {
              const menu = event.currentTarget;
              const remaining = menu.scrollHeight - menu.scrollTop - menu.clientHeight;
              // Start the next page just before the user reaches the bottom.
              if (menu.scrollHeight > menu.clientHeight && remaining <= 48) void more();
            }}
          >
            <div role="listbox" id={`${name}-list`} aria-label={label}>
              {options.map((o, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.id === o.id}
                  id={`${name}-option-${i}`}
                  className={active === i ? 'active' : ''}
                  key={o.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {loading && (
              <div className="lookup-status" role="status">
                <LoaderCircle className="spin" size={16} />
                Loading…
              </div>
            )}
            {!loading && !error && !options.length && (
              <div className="lookup-status" role="status">
                {search
                  ? 'No matching records. Try another search.'
                  : 'Type to search for records.'}
              </div>
            )}
            {error && (
              <div className="lookup-error" role="alert">
                {error}
                <button
                  type="button"
                  onClick={() => {
                    if (cursor) void more(true);
                    else setRefresh((v) => v + 1);
                  }}
                >
                  Retry lookup
                </button>
              </div>
            )}
            {cursor && !error && (
              <button
                type="button"
                className="load-more"
                disabled={loading}
                onClick={() => void more()}
              >
                Load more
              </button>
            )}
            {!loading && options.length >= LOOKUP_PAGE_SIZE && !cursor && (
              <div className="lookup-status">Refine your search to find more records.</div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
export function MultiLookup({ values, onChange, ...props }: MultiLookupProps) {
  return (
    <div className="multi-lookup">
      <Lookup
        {...props}
        value={null}
        onChange={(value) => {
          if (value && !values.some((v) => v.id === value.id)) onChange([...values, value]);
        }}
      />
      {values.length > 0 && (
        <div className="chips">
          {values.map((v) => (
            <span className="chip" key={v.id}>
              {v.label}
              <button
                type="button"
                aria-label={`Remove ${v.label}`}
                onClick={() => onChange(values.filter((item) => item.id !== v.id))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
