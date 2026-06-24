'use client';

import { useMemo, useState, useEffect } from 'react';
import { Select } from '@/components/ui/Select';
import { FilterSegmentedControl } from '@/components/portal/FilterSegmentedControl';
import { PortalFilterField } from '@/components/portal/PortalFilterField';
import { portalFieldClassName } from '@/components/portal';
import {
  formatWeekEndingFridayLabel,
  formatWorkingWeekLabel,
  getCurrentWorkingWeek,
  getNextWorkingWeek,
  getPreviousWorkingWeek,
  getWorkingWeekForFriday,
  listWeekEndingFridays,
} from '@/lib/working-week';
import { cn } from '@/lib/utils';

export type WorkingWeekSelection = {
  weekStart: string;
  weekEnd: string;
};

type WeekPreset = 'last' | 'current' | 'next' | 'custom';

interface WeekEndingFilterProps {
  value: WorkingWeekSelection;
  onChange: (week: WorkingWeekSelection) => void;
  className?: string;
}

function detectPreset(value: WorkingWeekSelection): WeekPreset {
  const last = getPreviousWorkingWeek();
  const current = getCurrentWorkingWeek();
  const next = getNextWorkingWeek();
  if (value.weekStart === last.weekStart && value.weekEnd === last.weekEnd) return 'last';
  if (value.weekStart === current.weekStart && value.weekEnd === current.weekEnd) return 'current';
  if (value.weekStart === next.weekStart && value.weekEnd === next.weekEnd) return 'next';
  return 'custom';
}

const presetOptions: { id: WeekPreset; label: string }[] = [
  { id: 'last', label: 'Last week' },
  { id: 'current', label: 'This week' },
  { id: 'next', label: 'Next week' },
];

function applyPreset(preset: WeekPreset): WorkingWeekSelection {
  if (preset === 'last') {
    const w = getPreviousWorkingWeek();
    return { weekStart: w.weekStart, weekEnd: w.weekEnd };
  }
  if (preset === 'next') {
    const w = getNextWorkingWeek();
    return { weekStart: w.weekStart, weekEnd: w.weekEnd };
  }
  const w = getCurrentWorkingWeek();
  return { weekStart: w.weekStart, weekEnd: w.weekEnd };
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

  const [preset, setPreset] = useState<WeekPreset>(() => detectPreset(value));

  useEffect(() => {
    setPreset(detectPreset(value));
  }, [value.weekStart, value.weekEnd]);

  const applyWeek = (week: WorkingWeekSelection, nextPreset: WeekPreset) => {
    setPreset(nextPreset);
    onChange(week);
  };

  const handlePreset = (nextPreset: WeekPreset) => {
    applyWeek(applyPreset(nextPreset), nextPreset);
  };

  const handleDropdown = (weekEnd: string) => {
    const option = weekOptions.find((o) => o.weekEnd === weekEnd);
    if (!option) return;
    applyWeek(
      { weekStart: option.weekStart, weekEnd: option.weekEnd },
      detectPreset({ weekStart: option.weekStart, weekEnd: option.weekEnd }),
    );
  };

  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200/70 bg-white/90 p-4 shadow-sm sm:p-5',
        className,
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Working week</h3>
            <p className="mt-1 text-sm text-slate-500">Saturday through Friday · week ending on Friday</p>
          </div>

          <FilterSegmentedControl
            options={presetOptions}
            value={preset === 'custom' ? null : preset}
            onChange={handlePreset}
            aria-label="Quick week selection"
          />
        </div>

        <PortalFilterField
          label="Week ending Friday"
          hint="Jump to a specific week"
          className="w-full lg:w-56 lg:shrink-0"
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

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-gradient-to-r from-primary/5 via-slate-50 to-primary/5 px-4 py-3 ring-1 ring-primary/10">
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
