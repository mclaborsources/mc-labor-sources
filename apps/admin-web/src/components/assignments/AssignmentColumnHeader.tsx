'use client';

import { useEffect, useRef, useState } from 'react';

export type AssignmentSortDirection = 'asc' | 'desc';

type Option = {
  value: string;
  label: string;
};

type AssignmentColumnHeaderProps = {
  label: string;
  compact?: boolean;
  options: Option[];
  selected: string[];
  onSelectedChange: (values: string[]) => void;
  sortDirection?: AssignmentSortDirection;
  onSort?: (direction: AssignmentSortDirection) => void;
  additionalActions?: Array<{ label: string; onSelect: () => void; active?: boolean }>;
  selectionMode?: boolean;
  searchLabel?: string;
};

export function AssignmentColumnHeader({
  label,
  compact = false,
  options,
  selected,
  onSelectedChange,
  sortDirection,
  onSort,
  additionalActions = [],
  selectionMode = false,
  searchLabel,
}: AssignmentColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selected);
  const visibleOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function toggle(value: string) {
    onSelectedChange(
      selectedSet.has(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <div ref={rootRef} className={compact ? 'relative -mx-1 -my-2' : 'relative -mx-3 -my-2'}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={compact
          ? 'relative flex min-h-12 w-full items-start justify-center px-0.5 pb-5 pt-1.5 text-center text-[9px] font-bold leading-[1.05] tracking-normal hover:bg-slate-200/70'
          : 'relative flex min-h-12 w-full items-center justify-center px-5 py-2 text-center text-[11px] font-extrabold leading-tight tracking-wide hover:bg-slate-200/70'}
        title={label}
      >
        <span className="block w-full text-center">{label}</span>
        <span
          className={compact
            ? 'absolute bottom-0.5 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded border border-slate-400 bg-slate-100 text-[7px] text-slate-800 shadow-sm'
            : 'absolute right-2 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-400 bg-slate-100 text-[9px] text-slate-800 shadow-sm'}
          aria-hidden
        >
          ▼
        </span>
        {sortDirection ? (
          <span className="sr-only">
            Sorted {sortDirection === 'asc' ? 'ascending' : 'descending'}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal normal-case tracking-normal text-slate-800 shadow-2xl"
        >
          {onSort ? (
            <>
              <button type="button" onClick={() => onSort('asc')} className="w-full rounded px-2 py-2 text-left hover:bg-slate-100">
                ↑ Sort A to Z
              </button>
              <button type="button" onClick={() => onSort('desc')} className="w-full rounded px-2 py-2 text-left hover:bg-slate-100">
                ↓ Sort Z to A
              </button>
              {additionalActions.map((option) => (
                <button key={option.label} type="button" onClick={option.onSelect} className={`w-full rounded px-2 py-2 text-left hover:bg-slate-100 ${option.active ? 'bg-blue-50 font-semibold text-blue-800' : ''}`}>
                  {option.active ? '✓' : '◉'} {option.label}
                </button>
              ))}
              <div className="my-1 border-t border-slate-200" />
            </>
          ) : null}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${(searchLabel ?? label).toLocaleLowerCase()}`}
            className="mb-2 h-9 w-full rounded border border-slate-300 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <div className="max-h-64 overflow-y-auto rounded border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => onSelectedChange(selectionMode ? options.map((option) => option.value) : [])}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100"
            >
              <input
                type="checkbox"
                checked={selectionMode ? options.length > 0 && options.every((option) => selectedSet.has(option.value)) : selected.length === 0}
                readOnly
                className="accent-blue-600"
              />
              <span>(Select All)</span>
            </button>
            {visibleOptions.map((option) => (
              <button key={option.value} type="button" onClick={() => toggle(option.value)} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100">
                <input type="checkbox" checked={selectedSet.has(option.value)} readOnly className="mt-0.5 accent-blue-600" />
                <span>{option.label || '(Blanks)'}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => onSelectedChange([])}
            className="mt-2 w-full rounded px-2 py-1.5 text-left text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            {selectionMode ? 'Clear selection' : `Clear filter from ${label}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
