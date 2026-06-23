'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatWorkingWeekLabel,
  getCurrentWorkingWeek,
  getNextWorkingWeek,
  getWorkingWeekForFriday,
  isFridayOrSaturday,
  type WorkingWeek,
} from '@/lib/working-week';

export type WorkingWeekSelection = Pick<WorkingWeek, 'weekStart' | 'weekEnd'>;

type WeekMode = 'current' | 'next' | 'custom';

interface WorkingWeekSelectorProps {
  value: WorkingWeekSelection;
  onChange: (week: WorkingWeekSelection) => void;
}

export function WorkingWeekSelector({ value, onChange }: WorkingWeekSelectorProps) {
  const [mode, setMode] = useState<WeekMode>('current');
  const [customFriday, setCustomFriday] = useState(value.weekEnd);

  const currentWeek = useMemo(() => getCurrentWorkingWeek(), []);
  const nextWeek = useMemo(() => getNextWorkingWeek(), []);

  useEffect(() => {
    if (mode === 'current') {
      onChange({ weekStart: currentWeek.weekStart, weekEnd: currentWeek.weekEnd });
    } else if (mode === 'next') {
      onChange({ weekStart: nextWeek.weekStart, weekEnd: nextWeek.weekEnd });
    } else if (customFriday) {
      const custom = getWorkingWeekForFriday(new Date(`${customFriday}T00:00:00`));
      onChange({ weekStart: custom.weekStart, weekEnd: custom.weekEnd });
    }
  }, [mode, customFriday, currentWeek, nextWeek, onChange]);

  const displayLabel = formatWorkingWeekLabel(value.weekStart, value.weekEnd);

  return (
    <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Working week (Sat–Fri)</h3>
        <p className="mt-1 text-sm text-gray-600">
          Assignment conflicts are checked only for the selected week. On Friday or Saturday, consider{' '}
          <strong>Next Week</strong> when planning ahead.
        </p>
        {isFridayOrSaturday() ? (
          <p className="mt-1 text-sm text-amber-800">Today is Fri/Sat — Next Week is often the right choice.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="working-week-mode"
            checked={mode === 'current'}
            onChange={() => setMode('current')}
          />
          Current Week
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="working-week-mode"
            checked={mode === 'next'}
            onChange={() => setMode('next')}
          />
          Next Week
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="working-week-mode"
            checked={mode === 'custom'}
            onChange={() => setMode('custom')}
          />
          Custom week ending (Friday)
        </label>
      </div>

      {mode === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="custom-week-friday" className="font-medium text-gray-700">
            Week ending
          </label>
          <input
            id="custom-week-friday"
            type="date"
            className="rounded border border-gray-300 px-2 py-1"
            value={customFriday}
            onChange={(e) => setCustomFriday(e.target.value)}
          />
        </div>
      ) : null}

      <p className="text-sm text-gray-700">
        <span className="font-medium">Selected:</span> {displayLabel} ({value.weekStart} → {value.weekEnd})
      </p>
    </div>
  );
}
