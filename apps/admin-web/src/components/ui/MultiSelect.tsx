'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formControlClassName } from './formStyles';

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectProps = {
  value: string[];
  options: MultiSelectOption[];
  allLabel: string;
  selectedLabel: string;
  onChange: (value: string[]) => void;
  className?: string;
};

export function MultiSelect({
  value,
  options,
  allLabel,
  selectedLabel,
  onChange,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const selected = new Set(value);
  const buttonLabel =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? options.find((option) => option.value === value[0])?.label ?? selectedLabel
        : `${value.length} ${selectedLabel}`;

  function toggle(optionValue: string) {
    onChange(
      selected.has(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          formControlClassName,
          'flex w-full items-center justify-between gap-2 bg-white text-left',
          className,
        )}
      >
        <span className="truncate">{buttonLabel}</span>
        <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="option"
            aria-selected={value.length === 0}
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <input type="checkbox" checked={value.length === 0} readOnly className="h-4 w-4 accent-blue-600" />
            <span>{allLabel}</span>
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected.has(option.value)}
              onClick={() => toggle(option.value)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <input type="checkbox" checked={selected.has(option.value)} readOnly className="h-4 w-4 accent-blue-600" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
