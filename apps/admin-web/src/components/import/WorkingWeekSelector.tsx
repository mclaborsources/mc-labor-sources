'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/Input';
import {
  formatWorkingWeekLabel,
  getCurrentWorkingWeek,
  getNextWorkingWeek,
  getWorkingWeekForFriday,
  isFridayOrSaturday,
  type WorkingWeek,
} from '@/lib/working-week';
import { cn } from '@/lib/utils';
import { FilterSegmentedControl } from '@/components/portal/FilterSegmentedControl';

export type WorkingWeekSelection = Pick<WorkingWeek, 'weekStart' | 'weekEnd'>;

type WeekMode = 'current' | 'next' | 'custom';

interface WorkingWeekSelectorProps {
  value: WorkingWeekSelection;
  onChange: (week: WorkingWeekSelection) => void;
  defaultMode?: WeekMode;
  defaultCustomFriday?: string;
  /** When true, omit outer border/background for use inside a parent card */
  embedded?: boolean;
}

function detectInitialMode(
  value: WorkingWeekSelection,
  defaultMode: WeekMode | undefined,
  currentWeek: WorkingWeek,
  nextWeek: WorkingWeek,
): WeekMode {
  if (defaultMode) return defaultMode;
  if (value.weekStart === currentWeek.weekStart && value.weekEnd === currentWeek.weekEnd) return 'current';
  if (value.weekStart === nextWeek.weekStart && value.weekEnd === nextWeek.weekEnd) return 'next';
  return 'custom';
}

const modeOptions: { id: WeekMode; label: string }[] = [
  { id: 'current', label: 'This week' },
  { id: 'next', label: 'Next week' },
  { id: 'custom', label: 'Custom' },
];

export function WorkingWeekSelector({
  value,
  onChange,
  defaultMode,
  defaultCustomFriday,
  embedded = false,
}: WorkingWeekSelectorProps) {
  const currentWeek = useMemo(() => getCurrentWorkingWeek(), []);
  const nextWeek = useMemo(() => getNextWorkingWeek(), []);
  const [mode, setMode] = useState<WeekMode>(() =>
    detectInitialMode(value, defaultMode, currentWeek, nextWeek),
  );
  const [customFriday, setCustomFriday] = useState(defaultCustomFriday ?? value.weekEnd);

  const applyMode = (nextMode: WeekMode, friday = customFriday) => {
    setMode(nextMode);
    if (nextMode === 'current') {
      onChange({ weekStart: currentWeek.weekStart, weekEnd: currentWeek.weekEnd });
    } else if (nextMode === 'next') {
      onChange({ weekStart: nextWeek.weekStart, weekEnd: nextWeek.weekEnd });
    } else if (friday) {
      const custom = getWorkingWeekForFriday(new Date(`${friday}T00:00:00`));
      onChange({ weekStart: custom.weekStart, weekEnd: custom.weekEnd });
    }
  };

  const displayLabel = formatWorkingWeekLabel(value.weekStart, value.weekEnd);

  return (
    <div className={cn('space-y-5', !embedded && 'rounded-xl border border-slate-200/70 bg-white/90 p-4 shadow-sm sm:p-5')}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Working week (Sat–Fri)</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Assignment conflicts are checked only for the selected week.
          {isFridayOrSaturday() ? (
            <span className="text-amber-800"> Today is Fri/Sat — next week is often the right choice.</span>
          ) : null}
        </p>
      </div>

      <FilterSegmentedControl
        options={modeOptions}
        value={mode}
        onChange={applyMode}
        aria-label="Working week mode"
      />

      {mode === 'custom' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
          <label htmlFor="custom-week-friday" className="text-sm font-medium text-slate-700">
            Week ending (Friday)
          </label>
          <Input
            id="custom-week-friday"
            type="date"
            className="w-auto max-w-[11rem]"
            value={customFriday}
            onChange={(e) => {
              setCustomFriday(e.target.value);
              applyMode('custom', e.target.value);
            }}
          />
        </div>
      ) : null}

      <div className="rounded-xl bg-gradient-to-r from-primary/5 via-slate-50 to-primary/5 px-4 py-3 text-sm text-slate-700 ring-1 ring-primary/10">
        <span className="font-medium text-slate-900">{displayLabel}</span>
      </div>
    </div>
  );
}
