'use client';

import { useState } from 'react';
import type { Employee } from '@/lib/domain-types';
import { cn } from '@/lib/utils';

type Field = 'manualTimesheetEnabled' | 'mobileAssignmentsEnabled' | 'mobileMessagesEnabled' | 'mobileTasksEnabled' | 'mobileProfileEnabled';
export function EmployeeMobileTabSettings({ employee, pending, pendingField, onToggle }: {
  employee: Employee; pending: boolean; pendingField?: string; onToggle: (field: Field) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const row = (label: string, field: Field) => {
    const enabled = Boolean(employee[field]);
    const saving = pending && pendingField === field;
    return <div key={field} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] [&>div:first-child]:col-span-2 sm:[&>div:first-child]:col-span-1 items-center gap-x-3 gap-y-2 border-b border-slate-100 px-3 py-2">
      <div><p className="text-xl leading-6 font-semibold text-slate-900">{label}</p><p className={cn('text-lg leading-6 font-bold', enabled ? 'text-emerald-700' : 'text-red-600')}>{enabled ? '● Currently enabled' : '● Currently disabled'}</p></div>
      <button type="button" disabled={enabled || pending} onClick={() => onToggle(field)} className={cn('rounded-lg min-h-11 px-2 py-2 text-lg leading-6 font-bold transition', enabled ? 'bg-emerald-600 text-white ring-2 ring-emerald-200' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>{saving ? '…' : enabled ? '✓ Enabled' : 'Enable'}</button>
      <button type="button" disabled={!enabled || pending} onClick={() => onToggle(field)} className={cn('rounded-lg min-h-11 px-2 py-2 text-lg leading-6 font-bold transition', !enabled ? 'bg-red-600 text-white ring-2 ring-red-200' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>{saving ? '…' : !enabled ? '✓ Disabled' : 'Disable'}</button>
    </div>;
  };
  return <>
    <div className="bg-gradient-to-r from-slate-950 to-slate-800 px-3 py-1"><p className="text-lg leading-6 font-black uppercase tracking-[0.08em] text-white">Employee mobile app tabs</p></div>
    {row('Manual Timesheet (MT)', 'manualTimesheetEnabled')}
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-slate-50 px-3 py-1"><button type="button" aria-expanded={expanded} aria-controls="employee-other-mobile-tabs" onClick={() => setExpanded(value => !value)} className="rounded-lg border border-slate-200 bg-white px-4 py-1 text-lg leading-6 font-bold text-slate-700 hover:bg-slate-100">{expanded ? 'Hide' : 'Unhide'}</button><p className="text-lg leading-6 text-slate-600">Other tab settings · hiding these controls does not disable the tabs.</p></div>
    {expanded ? <div id="employee-other-mobile-tabs">
      {row('Assignments', 'mobileAssignmentsEnabled')}
      {row('Messages', 'mobileMessagesEnabled')}
      {row('Tasks', 'mobileTasksEnabled')}
      {row('Profile', 'mobileProfileEnabled')}
    </div> : null}
  </>;
}
