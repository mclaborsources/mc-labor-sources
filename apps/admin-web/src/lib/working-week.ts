export interface WorkingWeek {
  weekStart: string;
  weekEnd: string;
  label: string;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShortDateWithYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Friday that ends the Sat–Fri working week containing refDate. */
export function getWeekEndingFriday(refDate: Date): Date {
  const d = startOfDay(refDate);
  const day = d.getDay();

  // Sat/Sun: current week ends on the upcoming Friday (planning week ahead on weekend).
  if (day === 6) {
    d.setDate(d.getDate() + 6);
  } else if (day === 0) {
    d.setDate(d.getDate() + 5);
  } else {
    d.setDate(d.getDate() + (5 - day));
  }
  return d;
}

/** MC Labor week = Saturday 00:00 through Friday (week ending Friday). */
export function getWorkingWeekForFriday(weekEnding: Date): WorkingWeek {
  const weekEnd = startOfDay(weekEnding);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);

  return {
    weekStart: toIsoDate(weekStart),
    weekEnd: toIsoDate(weekEnd),
    label: `${formatShortDate(weekStart)} – ${formatShortDateWithYear(weekEnd)}`,
  };
}

export function getCurrentWorkingWeek(refDate: Date = new Date()): WorkingWeek {
  const week = getWorkingWeekForFriday(getWeekEndingFriday(refDate));
  return {
    ...week,
    label: `Current Week · ${week.label}`,
  };
}

export function getNextWorkingWeek(refDate: Date = new Date()): WorkingWeek {
  const currentFriday = getWeekEndingFriday(refDate);
  const nextFriday = new Date(currentFriday);
  nextFriday.setDate(nextFriday.getDate() + 7);
  const week = getWorkingWeekForFriday(nextFriday);
  return {
    ...week,
    label: `Next Week · ${week.label}`,
  };
}

export function getPreviousWorkingWeek(refDate: Date = new Date()): WorkingWeek {
  const currentFriday = getWeekEndingFriday(refDate);
  const prevFriday = new Date(currentFriday);
  prevFriday.setDate(prevFriday.getDate() - 7);
  const week = getWorkingWeekForFriday(prevFriday);
  return {
    ...week,
    label: `Last Week · ${week.label}`,
  };
}

/** Move backward or forward from a selected week by a number of whole weeks. */
export function shiftWorkingWeek(weekEnd: string, weekOffset: number): WorkingWeek {
  const shiftedFriday = new Date(`${weekEnd}T12:00:00`);
  shiftedFriday.setDate(shiftedFriday.getDate() + weekOffset * 7);
  return getWorkingWeekForFriday(shiftedFriday);
}

export function formatWeekEndingFridayLabel(weekEnd: string): string {
  const d = new Date(`${weekEnd}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export type WeekEndingOption = {
  weekEnd: string;
  label: string;
  weekStart: string;
};

/** Recent week-ending Fridays for dropdowns (newest first). */
export function listWeekEndingFridays(options?: {
  pastWeeks?: number;
  futureWeeks?: number;
  refDate?: Date;
}): WeekEndingOption[] {
  const { pastWeeks = 52, futureWeeks = 8, refDate = new Date() } = options ?? {};
  const anchor = getWeekEndingFriday(refDate);
  const results: WeekEndingOption[] = [];

  for (let offset = futureWeeks; offset >= -pastWeeks; offset -= 1) {
    const friday = new Date(anchor);
    friday.setDate(friday.getDate() + offset * 7);
    const week = getWorkingWeekForFriday(friday);
    results.push({
      weekEnd: week.weekEnd,
      weekStart: week.weekStart,
      label: formatWeekEndingFridayLabel(week.weekEnd),
    });
  }

  return results;
}

/** Match DB assignment_overlaps_week — assignment active any day in Sat–Fri week. */
export function assignmentOverlapsWeek(
  assignedDate: string,
  endDate: string | null | undefined,
  weekStart: string,
  weekEnd: string,
): boolean {
  const assigned = assignedDate.split('T')[0];
  const end = (endDate?.split('T')[0] ?? weekEnd);
  return assigned <= weekEnd && end >= weekStart;
}

export function formatWorkingWeekLabel(
  weekStart: string,
  weekEnd: string,
  prefix?: string,
): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekEnd}T00:00:00`);
  const range = `${formatShortDate(start)} – ${formatShortDateWithYear(end)}`;
  return prefix ? `${prefix} · ${range}` : range;
}

export function isFridayOrSaturday(refDate: Date = new Date()): boolean {
  const day = refDate.getDay();
  return day === 5 || day === 6;
}
