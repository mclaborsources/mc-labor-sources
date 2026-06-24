'use client';

import { cn } from '@/lib/utils';

export type FilterSegmentOption<T extends string = string> = {
  id: T;
  label: string;
};

interface FilterSegmentedControlProps<T extends string> {
  options: FilterSegmentOption<T>[];
  value?: T | null;
  onChange: (id: T) => void;
  className?: string;
  'aria-label'?: string;
}

export function FilterSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel = 'Filter options',
}: FilterSegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70 sm:w-auto',
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'min-w-0 flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 sm:flex-none sm:px-5',
              active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
