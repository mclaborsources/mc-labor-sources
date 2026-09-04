export function officeWeekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  const day = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 1) % 7));
  return day.toISOString().slice(0, 10);
}

export function permittedSelectedWeek(selected: string, current: string, previous: boolean, next: boolean, lastCurrent = current): string {
  if (lastCurrent !== current) return current;
  const shifted = (days: number) => { const date = new Date(`${current}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  return selected === current || (previous && selected === shifted(-7)) || (next && selected === shifted(7)) ? selected : current;
}
