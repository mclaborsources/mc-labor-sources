// Preserve stored color values; the legacy RED choice now displays soft gold.
export const EMPLOYEE_ACTION_COLORS = [
  { value: 'BLUE', label: 'Blue', background: '#3b82f6', border: '#2563eb' },
  { value: 'ORANGE', label: 'Peach', background: '#f7cdb0', border: '#eab790' },
  { value: 'GREEN', label: 'Green', background: '#c5dfbe', border: '#a6c99d' },
  { value: 'RED', label: 'Gold', background: '#f6d15b', border: '#dfb839' },
] as const;

export function employeeActionFlags(employee: {
  status: string; mobilePreviousWeekEnabled?: boolean; manualTimesheetEnabled?: boolean;
}, account: { status: string } | undefined, portalKnown: boolean, nextWeek: boolean | undefined) {
  return [
    { code: 'PA', label: 'Portal access', enabled: portalKnown ? employee.status === 'ACTIVE' && account?.status === 'ACTIVE' : undefined },
    { code: 'PW', label: 'Previous week', enabled: Boolean(employee.mobilePreviousWeekEnabled) },
    { code: 'NW', label: 'Next week (automatic)', enabled: nextWeek },
    { code: 'MT', label: 'Manual Timesheet tab', enabled: Boolean(employee.manualTimesheetEnabled) },
  ];
}
