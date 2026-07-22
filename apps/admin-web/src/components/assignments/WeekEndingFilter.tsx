'use client';

import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Select } from '@/components/ui/Select';
import { FilterSegmentedControl } from '@/components/portal/FilterSegmentedControl';
import { PortalFilterField } from '@/components/portal/PortalFilterField';
import { portalFieldClassName } from '@/components/portal';
import {
  formatWeekEndingFridayLabel,
  formatWorkingWeekLabel,
  getCurrentWorkingWeek,
  getWorkingWeekForFriday,
  listWeekEndingFridays,
  shiftWorkingWeek,
} from '@/lib/working-week';
import { cn } from '@/lib/utils';

export type WorkingWeekSelection = {
  weekStart: string;
  weekEnd: string;
};

type WeekPreset = 'last' | 'current' | 'next';

const presetOptions: { id: WeekPreset; label: string }[] = [
  { id: 'last', label: 'Previous week' },
  { id: 'current', label: 'This week' },
  { id: 'next', label: 'Next week' },
];

interface WeekEndingFilterProps {
  value: WorkingWeekSelection;
  onChange: Dispatch<SetStateAction<WorkingWeekSelection>>;
  className?: string;
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
    </svg>
  );
}

export function WeekEndingFilter({ value, onChange, className }: WeekEndingFilterProps) {
  const weekOptions = useMemo(() => {
    const base = listWeekEndingFridays();
    if (base.some((option) => option.weekEnd === value.weekEnd)) {
      return base;
    }
    const customWeek = getWorkingWeekForFriday(new Date(`${value.weekEnd}T12:00:00`));
    return [
      {
        weekEnd: customWeek.weekEnd,
        weekStart: customWeek.weekStart,
        label: formatWeekEndingFridayLabel(customWeek.weekEnd),
      },
      ...base,
    ];
  }, [value.weekEnd]);

  const applyWeek = (week: WorkingWeekSelection) => {
    onChange(week);
  };

  const currentWeek = getCurrentWorkingWeek();
  const selectedPreset =
    value.weekStart === currentWeek.weekStart && value.weekEnd === currentWeek.weekEnd
      ? 'current'
      : null;

  const handlePreset = (preset: WeekPreset) => {
    if (preset === 'current') {
      applyWeek({ weekStart: currentWeek.weekStart, weekEnd: currentWeek.weekEnd });
      return;
    }
    const week = shiftWorkingWeek(value.weekEnd, preset === 'last' ? -1 : 1);
    applyWeek({ weekStart: week.weekStart, weekEnd: week.weekEnd });
  };

  const handleDropdown = (weekEnd: string) => {
    const option = weekOptions.find((o) => o.weekEnd === weekEnd);
    if (!option) return;
    applyWeek({ weekStart: option.weekStart, weekEnd: option.weekEnd });
  };

  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200/70 bg-white/90 p-2 shadow-sm 2xl:grid 2xl:grid-cols-[18rem_minmax(0,1fr)_20rem] 2xl:items-end 2xl:gap-2.5',
        className,
      )}
    >
      <div className="grid gap-3 2xl:contents">
        <div className="min-w-0 space-y-1">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Working week</h3>
            <p className="mt-0.5 text-xs text-slate-500">Saturday through Friday · week ending on Friday</p>
          </div>

          <FilterSegmentedControl
            options={presetOptions}
            value={selectedPreset}
            onChange={handlePreset}
            className="!mt-1 !grid !w-full !grid-cols-3 !gap-0.5 !rounded-lg !p-0.5 [&>button]:min-h-9 [&>button]:whitespace-normal [&>button]:!px-1.5 [&>button]:!py-1.5 [&>button]:!text-xs [&>button]:leading-tight"
            aria-label="Quick week selection"
          />
        </div>

        <PortalFilterField
          label="Week ending Friday"
          hint="Jump to a specific week"
          className="w-full 2xl:order-3"
        >
          <Select
            id="week-ending-friday"
            value={value.weekEnd}
            onChange={(e) => handleDropdown(e.target.value)}
            className={portalFieldClassName}
          >
            {weekOptions.map((option) => (
              <option key={option.weekEnd} value={option.weekEnd}>
                {option.label}
              </option>
            ))}
          </Select>
        </PortalFilterField>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-gradient-to-r from-primary/5 via-slate-50 to-primary/5 px-3 py-2 ring-1 ring-primary/10 2xl:order-2 2xl:mt-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm ring-1 ring-primary/10">
          <CalendarIcon className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-slate-700">
          Showing assignments for week ending{' '}
          <span className="font-semibold text-slate-900">
            {formatWeekEndingFridayLabel(value.weekEnd)}
          </span>
          <span className="text-slate-400"> · </span>
          <span className="text-slate-600">{formatWorkingWeekLabel(value.weekStart, value.weekEnd)}</span>
        </p>
      </div>
    </section>
  );
}
