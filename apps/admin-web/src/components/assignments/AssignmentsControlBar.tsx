'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  getCurrentWorkingWeek,
  getPreviousWorkingWeek,
  getWeekEndingFriday,
  getWorkingWeekForFriday,
  shiftWorkingWeek,
} from '@/lib/working-week';
import type { WorkingWeekSelection } from './WeekEndingFilter';

type AssignmentStats = {
  total: number;
  active: number;
  pending: number;
  completed: number;
};

interface AssignmentsControlBarProps {
  value: WorkingWeekSelection;
  onChange: Dispatch<SetStateAction<WorkingWeekSelection>>;
  stats: AssignmentStats;
  onNewAssignment: () => void;
  onTestJob: () => void;
}

function ordinal(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

function longDate(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${month} ${ordinal(date.getDate())}`;
}

export function AssignmentsControlBar({
  value,
  onChange,
  stats,
  onNewAssignment,
  onTestJob,
}: AssignmentsControlBarProps) {
  const currentWeek = getCurrentWorkingWeek();
  const lastWeek = getPreviousWorkingWeek();
  const isCurrentWeek =
    value.weekStart === currentWeek.weekStart && value.weekEnd === currentWeek.weekEnd;
  const isLastWeek = value.weekStart === lastWeek.weekStart && value.weekEnd === lastWeek.weekEnd;

  function applyWeek(week: WorkingWeekSelection) {
    onChange({ weekStart: week.weekStart, weekEnd: week.weekEnd });
  }

  function selectDate(value: string) {
    if (!value) return;
    const selected = new Date(`${value}T12:00:00`);
    applyWeek(getWorkingWeekForFriday(getWeekEndingFriday(selected)));
  }

  const quickButton =
    'min-h-10 rounded-md border border-slate-600 px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <section className="mb-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-white shadow-lg">
      <div className="grid gap-2 p-2 lg:grid-cols-[9rem_repeat(4,minmax(6.5rem,auto))_minmax(11rem,1fr)_auto] lg:items-stretch">
        <div className="flex min-h-10 items-center px-3 text-lg font-bold">Assignments:</div>
        <button
          type="button"
          onClick={() => applyWeek(shiftWorkingWeek(value.weekEnd, -1))}
          className={`${quickButton} bg-white text-slate-900 hover:bg-blue-50`}
        >
          Previous Week
        </button>
        <button
          type="button"
          onClick={() => applyWeek(lastWeek)}
          className={`${quickButton} ${
            isLastWeek ? 'border-blue-400 bg-blue-600 text-white' : 'bg-white text-slate-900 hover:bg-blue-50'
          }`}
        >
          Last Week
        </button>
        <button
          type="button"
          onClick={() => applyWeek(currentWeek)}
          className={`${quickButton} ${
            isCurrentWeek ? 'border-blue-400 bg-blue-600 text-white' : 'bg-white text-slate-900 hover:bg-blue-50'
          }`}
        >
          This Week
        </button>
        <button
          type="button"
          onClick={() => applyWeek(shiftWorkingWeek(value.weekEnd, 1))}
          className={`${quickButton} bg-white text-slate-900 hover:bg-blue-50`}
        >
          Next Week
        </button>
        <label className="relative min-h-10">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm font-semibold text-slate-500">
            Search Week Ending
          </span>
          <input
            type="date"
            value={value.weekEnd}
            onChange={(event) => selectDate(event.target.value)}
            aria-label="Search week ending"
            className="h-full min-h-10 w-full rounded-md border border-slate-600 bg-white px-3 text-right text-sm font-medium text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40"
          />
        </label>
        <div className="grid min-w-[17rem] grid-cols-4 overflow-hidden rounded-md border border-slate-600 bg-white text-slate-900">
          {(
            [
              ['Total', stats.total],
              ['Active', stats.active],
              ['Pending', stats.pending],
              ['Completed', stats.completed],
            ] as const
          ).map(([label, number]) => (
            <div key={label} className="flex min-w-0 flex-col items-center justify-center border-r border-slate-200 px-2 py-1 last:border-r-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
              <span className="text-base font-bold leading-tight text-slate-950">{number}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 border-t border-slate-700 p-2 lg:grid-cols-[9rem_minmax(0,1fr)_17rem]">
        <div aria-hidden />
        <div className="flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-semibold">
          <span className="uppercase tracking-wide text-blue-300">Work Week</span>
          <span className="text-slate-500">—</span>
          <span>{longDate(value.weekStart)}</span>
          <span className="text-blue-300">to</span>
          <span>{longDate(value.weekEnd)}</span>
        </div>
        <div className="flex min-h-10 gap-2">
          <button
            type="button"
            onClick={onTestJob}
            className="flex-1 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Test Job
          </button>
          <button
            type="button"
            onClick={onNewAssignment}
            className="flex-1 rounded-md bg-blue-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            + New Assignment
          </button>
        </div>
      </div>
    </section>
  );
}
