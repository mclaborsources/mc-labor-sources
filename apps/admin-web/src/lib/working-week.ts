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
function getWeekEndingFriday(refDate: Date): Date {
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
  const week = getWorkingWeekForFriday(refDate);
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
