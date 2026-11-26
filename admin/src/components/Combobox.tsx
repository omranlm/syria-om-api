import {useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode} from 'react';
import {Icon} from './Icon';

export interface ComboOption {
  value: string;
  label: string;
  group?: string;
  /** Extra text the search also matches (e.g. "Damascus" for "Asia/Damascus"). */
  keywords?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();

/** The label with the matched part in bold. */
function highlight(label: string, query: string): ReactNode {
  if (!query) return label;
  const i = norm(label).indexOf(query);
  // norm() keeps the length when only _ and / change, which is the case for zone labels.
  if (i < 0 || norm(label).length !== label.length) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark>{label.slice(i, i + query.length)}</mark>
      {label.slice(i + query.length)}
    </>
  );
}

/**
 * A searchable dropdown (ARIA combobox with a listbox popup): type to filter, ↑/↓ to move, Enter to pick, Esc to
 * close. The field shows the selected option's label when closed.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  label,
  disabled,
  emptyText,
  dir,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  emptyText: string;
  dir?: 'ltr' | 'rtl';
}) {
  const id = useId();
  const listId = `${id}-list`;
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Filtering hundreds of options stays smooth while typing: the list renders at lower priority.
  const deferred = useDeferredValue(norm(query));
  const selected = options.find(o => o.value === value);

  const matches = useMemo(() => {
    if (!deferred) return options;
    const words = deferred.split(' ');
    // Best matches first: the last word of the label (the city) starts with the text, then any word does,
    // then the text is anywhere. Equal scores keep their original order.
    const score = (o: ComboOption) => {
      const label = norm(o.label);
      const extra = norm(o.keywords ?? '');
      if (label.split(' ').pop()!.startsWith(deferred) || extra.startsWith(deferred)) return 0;
      if (` ${label} ${extra}`.includes(` ${words[0]}`)) return 1;
      return 2;
    };
    return options
      .filter(o => {
        const hay = norm(`${o.label} ${o.keywords ?? ''} ${o.group ?? ''}`);
        return words.every(w => hay.includes(w));
      })
      .map((o, i) => ({o, i, s: score(o)}))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map(x => x.o);
  }, [options, deferred]);

  // Open on the selected option; while typing, keep the first match active.
  useEffect(() => {
    if (!open) return;
    const i = deferred ? 0 : Math.max(0, matches.findIndex(o => o.value === value));
    setActive(i);
  }, [open, deferred, matches, value]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block: 'nearest'});
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(o: ComboOption | undefined) {
    if (!o) return;
    onChange(o.value);
    close();
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive(a => Math.min(matches.length - 1, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(a => Math.max(0, a - 1));
        break;
      case 'PageDown':
        e.preventDefault();
        setActive(a => Math.min(matches.length - 1, a + 10));
        break;
      case 'PageUp':
        e.preventDefault();
        setActive(a => Math.max(0, a - 10));
        break;
      case 'Enter':
        if (open) {
          e.preventDefault();
          pick(matches[active]);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  // Group headers are rendered between options, from the (already grouped) option order.
  let lastGroup: string | undefined;

  return (
    <div className={`combobox${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} ref={root} dir={dir}>
      <div className="combo-field">
        <Icon name="search" />
        <input
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
          value={open ? query : (selected?.label ?? '')}
          placeholder={open ? (selected?.label ?? placeholder) : placeholder}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          tabIndex={-1}
          className="combo-toggle"
          aria-label={label}
          disabled={disabled}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Icon name="down" size={16} />
        </button>
      </div>
      {open && (
        <ul className="combo-list" role="listbox" id={listId} ref={list} aria-label={label}>
          {matches.length === 0 && <li className="combo-empty">{emptyText}</li>}
          {matches.map((o, i) => {
            // Group headers only for the full list; ranked search results are flat.
            const header = !deferred && o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.value} role="presentation">
                {header && <div className="combo-group">{header}</div>}
                <div
                  id={`${id}-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={o.value === value}
                  className={`combo-option${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}`}
                  onPointerMove={() => i !== active && setActive(i)}
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  {highlight(o.label, deferred)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
