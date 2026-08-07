'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Timesheet, TimesheetEntry } from '@/lib/domain-types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { formatEmployeeName } from '@/lib/portal-stats';
import { GpsLocationCell } from '@/components/portal/GpsLocationCell';

interface TimesheetDetailModalProps {
  open: boolean;
  onClose: () => void;
  timesheet: Timesheet | null;
  notice?: { tone: 'complete' | 'warning'; message: string };
  onViewMissingTimesheets?: () => void;
  onEditHours?: () => void;
  onSign?: () => void;
  showSignAction?: boolean;
  relatedTimesheets?: Timesheet[];
  onSelectTimesheet?: (timesheetId: string) => void;
}

type DayColumn = { date: string; entries: TimesheetEntry[] };

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getDays(timesheet: Timesheet): DayColumn[] {
  const entries = [...(timesheet.entries ?? [])].sort((a, b) =>
    `${a.workDate}-${a.startTime}`.localeCompare(`${b.workDate}-${b.startTime}`),
  );
  const dates =
    timesheet.weekStartDate && timesheet.weekEndDate
      ? Array.from({ length: 7 }, (_, index) => addDays(timesheet.weekStartDate!, index)).filter(
          (date) => date <= timesheet.weekEndDate!,
        )
      : timesheet.workDate
        ? [timesheet.workDate]
        : [...new Set(entries.map((entry) => entry.workDate))];
  return dates.map((date) => ({ date, entries: entries.filter((entry) => entry.workDate === date) }));
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  if (!value.includes('T')) return value;
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function LocationCell({ entry, direction }: { entry?: TimesheetEntry; direction: 'in' | 'out' }) {
  const attendance = entry?.attendanceLog;
  if (!attendance) return <span className="text-[11px] text-slate-400">Not recorded</span>;
  return (
    <GpsLocationCell
      lat={direction === 'in' ? attendance.clockInLatitude : attendance.clockOutLatitude}
      lng={direction === 'in' ? attendance.clockInLongitude : attendance.clockOutLongitude}
      label={direction === 'in' ? attendance.clockInLocationLabel : attendance.clockOutLocationLabel}
    />
  );
}

function TrackingItem({ label, complete, detail }: { label: string; complete: boolean; detail: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-blue-200/70 py-3 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
      <span className={`flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold ${complete ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
        {complete ? '✓' : '—'}
      </span>
    </div>
  );
}

export function TimesheetDetailModal({
  open,
  onClose,
  timesheet,
  notice,
  onViewMissingTimesheets,
  onEditHours,
  onSign,
  showSignAction = false,
  relatedTimesheets = [],
  onSelectTimesheet,
}: TimesheetDetailModalProps) {
  const [chosenTimesheetId, setChosenTimesheetId] = useState('');

  useEffect(() => {
    if (open) setChosenTimesheetId(timesheet?.id ?? relatedTimesheets[0]?.id ?? '');
  }, [open, timesheet?.id, relatedTimesheets]);

  const days = useMemo(() => (timesheet ? getDays(timesheet) : []), [timesheet]);
  if (!timesheet) return null;

  const totalHours = Number(timesheet.totalHours ?? 0);
  const regularHours = Math.min(40, totalHours);
  const overtimeHours = Math.max(0, totalHours - 40);
  const maxSessions = Math.max(1, ...days.map((day) => day.entries.length));
  const received = ['SUBMITTED', 'SIGNED', 'SENT', 'APPROVED'].includes(timesheet.status);
  const reviewed = Boolean(timesheet.readyToSend) || ['SENT', 'APPROVED'].includes(timesheet.status);
  const sent = Boolean(timesheet.deliveries?.length) || timesheet.status === 'SENT';
  const canSign = showSignAction && onSign && !['SIGNED', 'SENT'].includes(timesheet.status) && !timesheet.signature?.signatureImageUrl;
  const period = timesheet.weekStartDate && timesheet.weekEndDate ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}` : timesheet.workDate ?? '—';

  return (
    <Modal open={open} onClose={onClose} title="Weekly Timesheet" subtitle={`${formatEmployeeName(timesheet.employee)} · ${period}`} icon="clock" size="xl" fullScreen>
      <div className="space-y-5">
        {notice ? (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <span>{notice.message}</span>
            {notice.tone === 'warning' && onViewMissingTimesheets ? <Button size="sm" variant="secondary" icon="eye" onClick={onViewMissingTimesheets}>View Unsubmitted</Button> : null}
          </div>
        ) : null}

        {relatedTimesheets.length > 1 && onSelectTimesheet ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Available timesheets
              <select value={chosenTimesheetId} onChange={(event) => { setChosenTimesheetId(event.target.value); onSelectTimesheet(event.target.value); }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800">
                {relatedTimesheets.map((option, index) => <option key={option.id} value={option.id}>Timesheet {index + 1} · {option.weekStartDate ?? option.workDate} · {option.totalHours}h · {option.status}</option>)}
              </select>
            </label>
            <Badge status={timesheet.status} className="mb-2 rounded-full normal-case" />
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="bg-slate-900 px-4 py-2 text-center text-xs font-bold uppercase tracking-widest text-white">Work week · {period}</div>
              <dl className="grid text-sm sm:grid-cols-2">
                {[
                  ['Company name', timesheet.customer?.companyName ?? '—'],
                  ['Employee', formatEmployeeName(timesheet.employee)],
                  ['Job name', timesheet.jobSite?.name ?? '—'],
                  ['Job address', timesheet.manualJobAddress ?? timesheet.jobSite?.address ?? '—'],
                  ['Foreman name', timesheet.manualForemanName ?? timesheet.signature?.foremanName ?? timesheet.jobSite?.foremanName ?? '—'],
                  ['Foreman contact', timesheet.jobSite?.foremanPhone ?? timesheet.jobSite?.foremanEmail ?? timesheet.signature?.foremanEmail ?? '—'],
                  ['Scheduled start', timesheet.assignment?.startTime ?? '—'],
                  ['Status', timesheet.status],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[8rem_1fr] border-b border-slate-200 px-3 py-2 even:sm:border-l">
                    <dt className="font-semibold text-slate-600">{label}</dt><dd className="font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
              <table className="w-full min-w-[58rem] border-collapse text-center text-xs">
                <thead className="bg-slate-900 text-white">
                  <tr><th className="w-24 border-r border-slate-600 px-2 py-3 text-left">Entry</th>{days.map((day) => <th key={day.date} className="border-r border-slate-600 px-2 py-2"><span className="block font-bold">{dayLabel(day.date).split(',')[0]}</span><span className="mt-1 block font-normal text-slate-300">{day.date}</span></th>)}<th className="px-2 py-2">TH</th><th className="px-2 py-2">RH</th><th className="px-2 py-2">OT</th></tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxSessions }, (_, sessionIndex) => (
                    <TimesheetSessionRows key={sessionIndex} sessionIndex={sessionIndex} days={days} showTotals={sessionIndex === 0} totals={{ totalHours, regularHours, overtimeHours }} />
                  ))}
                  <tr className="border-t-2 border-slate-800 bg-slate-50"><th className="px-2 py-3 text-left font-bold text-slate-700">Hours</th>{days.map((day) => <td key={day.date} className="border-l border-slate-200 px-2 py-3 font-bold text-slate-900">{day.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0).toFixed(2)}</td>)}<td className="border-l border-slate-300 font-bold">{totalHours.toFixed(2)}</td><td className="border-l border-slate-300 font-bold">{regularHours.toFixed(2)}</td><td className="border-l border-slate-300 font-bold text-amber-700">{overtimeHours.toFixed(2)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white">
              <div className="border-b border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer delivery history</p>{timesheet.deliveries?.length ? <div className="mt-2 space-y-2">{timesheet.deliveries.map((delivery) => <p key={`${delivery.batchId}-${delivery.sentAt}`} className="text-sm text-slate-700">Sent to <strong>{delivery.recipientEmail}</strong> on {formatDateTime(delivery.sentAt)} by {delivery.sentBy?.name ?? 'Administrator'}.</p>)}</div> : <p className="mt-2 text-sm text-slate-500">Not sent to the customer yet.</p>}</div>
              <div className="p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Office / employee notes</p><p className="mt-2 min-h-10 whitespace-pre-wrap text-sm text-slate-700">{timesheet.notes || 'No notes recorded.'}</p></div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-800">Tracking timesheet</p>
              <div className="mt-2"><TrackingItem label="Received from employee" complete={received} detail={received ? formatDateTime(timesheet.createdAt) : 'Waiting for employee submission'} /><TrackingItem label="Approved by office staff" complete={reviewed} detail={timesheet.readyToSend ? formatDateTime(timesheet.readyToSendAt) : reviewed ? 'Approved' : 'Waiting for office review'} /><TrackingItem label="Sent to customer" complete={sent} detail={timesheet.deliveries?.[0] ? `${formatDateTime(timesheet.deliveries[0].sentAt)} · ${timesheet.deliveries[0].sentBy?.name ?? 'Administrator'}` : 'Not sent yet'} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Office review note</p><p className="mt-3 min-h-20 whitespace-pre-wrap text-sm leading-6 text-slate-700">{timesheet.notes || 'No office review note recorded.'}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">Approved to send</p><p className="mt-1 text-xs text-slate-500">Read-only; updated by the office workflow.</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-lg font-bold ${timesheet.readyToSend ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{timesheet.readyToSend ? '✓' : '—'}</span></div>{timesheet.readyToSendAt ? <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{formatDateTime(timesheet.readyToSendAt)}</p> : null}</div>
          </aside>
        </div>
      </div>

      <ModalFooter><Button variant="secondary" icon="cancel" onClick={onClose}>Close</Button>{onEditHours ? <Button icon="edit" onClick={onEditHours}>Edit Hours</Button> : null}{canSign ? <Button icon="signature" onClick={onSign}>Sign Timesheet</Button> : null}</ModalFooter>
    </Modal>
  );
}

function TimesheetSessionRows({ sessionIndex, days, showTotals, totals }: { sessionIndex: number; days: DayColumn[]; showTotals: boolean; totals: { totalHours: number; regularHours: number; overtimeHours: number } }) {
  const rows = [
    { label: `Clock in${sessionIndex ? ` ${sessionIndex + 1}` : ''}`, render: (entry?: TimesheetEntry) => formatTime(entry?.attendanceLog?.clockInTime ?? entry?.startTime) },
    { label: 'GPS in', render: (entry?: TimesheetEntry) => <LocationCell entry={entry} direction="in" /> },
    { label: `Clock out${sessionIndex ? ` ${sessionIndex + 1}` : ''}`, render: (entry?: TimesheetEntry) => formatTime(entry?.attendanceLog?.clockOutTime ?? entry?.endTime) },
    { label: 'GPS out', render: (entry?: TimesheetEntry) => <LocationCell entry={entry} direction="out" /> },
  ];
  return <>{rows.map((row, rowIndex) => <tr key={row.label} className={rowIndex === 0 && sessionIndex > 0 ? 'border-t-2 border-slate-400' : 'border-t border-slate-200'}><th className="bg-slate-900 px-2 py-2 text-left font-semibold text-white">{row.label}</th>{days.map((day) => <td key={day.date} className="max-w-28 border-l border-slate-200 px-2 py-2 text-slate-700">{row.render(day.entries[sessionIndex])}</td>)}{showTotals && rowIndex === 0 ? <><td rowSpan={4} className="border-l border-slate-300 bg-slate-50 font-bold">{totals.totalHours.toFixed(2)}</td><td rowSpan={4} className="border-l border-slate-300 bg-slate-50 font-bold">{totals.regularHours.toFixed(2)}</td><td rowSpan={4} className="border-l border-slate-300 bg-slate-50 font-bold text-amber-700">{totals.overtimeHours.toFixed(2)}</td></> : !showTotals ? <><td className="border-l border-slate-200" /><td className="border-l border-slate-200" /><td className="border-l border-slate-200" /></> : null}</tr>)}</>;
}
