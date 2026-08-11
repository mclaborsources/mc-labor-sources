'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Timesheet, TimesheetEntry } from '@/lib/domain-types';
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
  onSaveEdits?: (values: { dailyHours: Record<string, number>; officeNotes: string }) => Promise<void>;
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
  onSaveEdits,
  onSign,
  showSignAction = false,
  relatedTimesheets = [],
}: TimesheetDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [dailyHours, setDailyHours] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [expandedTimesheetIds, setExpandedTimesheetIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setEditing(false);
      setShowDetails(false);
      setExpandedTimesheetIds([]);
      setNotes(timesheet?.officeNotes ?? '');
      setEditError('');
    }
  }, [open, timesheet?.id, relatedTimesheets]);

  const days = useMemo(() => (timesheet ? getDays(timesheet) : []), [timesheet]);
  if (!timesheet) return null;

  const totalHours = Number(timesheet.totalHours ?? 0);
  const regularHours = Math.min(40, totalHours);
  const overtimeHours = Math.max(0, totalHours - 40);
  const editedTotalHours = editing
    ? Object.values(dailyHours).reduce((sum, value) => sum + (Number(value) || 0), 0)
    : totalHours;
  const displayedRegularHours = editing ? Math.min(40, editedTotalHours) : regularHours;
  const displayedOvertimeHours = editing ? Math.max(0, editedTotalHours - 40) : overtimeHours;
  const maxSessions = Math.max(1, ...days.map((day) => day.entries.length));
  const groupedTimesheets = relatedTimesheets.length > 1 ? relatedTimesheets : [];
  const received = ['SUBMITTED', 'SIGNED', 'SENT', 'APPROVED'].includes(timesheet.status);
  const reviewed = Boolean(timesheet.readyToSend) || ['SENT', 'APPROVED'].includes(timesheet.status);
  const sent = Boolean(timesheet.deliveries?.length) || timesheet.status === 'SENT';
  const canSign = showSignAction && onSign && !['SIGNED', 'SENT'].includes(timesheet.status) && !timesheet.signature?.signatureImageUrl;
  const period = timesheet.weekStartDate && timesheet.weekEndDate ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}` : timesheet.workDate ?? '—';

  function beginEditing() {
    setDailyHours(Object.fromEntries(days.map((day) => [day.date, day.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0).toFixed(2)])));
    setNotes(timesheet?.officeNotes ?? '');
    setEditError('');
    setEditing(true);
  }

  async function saveEdits() {
    if (!onSaveEdits) return;
    const parsed = Object.fromEntries(Object.entries(dailyHours).map(([date, value]) => [date, Number(value)]));
    const invalid = Object.values(parsed).some((hours) => !Number.isFinite(hours) || hours < 0 || hours > 24);
    if (invalid) {
      setEditError('Hours must be a number between 0 and 24.');
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      const changedHours = Object.fromEntries(
        Object.entries(parsed).filter(([date, hours]) => {
          const day = days.find((item) => item.date === date);
          const original = day?.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0) ?? 0;
          const displayedOriginal = Number(original.toFixed(2));
          return Math.abs(hours - displayedOriginal) > 0.000001;
        }),
      );
      await onSaveEdits({ dailyHours: changedHours, officeNotes: notes });
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save the timesheet changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Weekly Timesheet" subtitle={`${formatEmployeeName(timesheet.employee)} · ${period}`} icon="clock" size="xl" fullScreen headerCloseLabel="Close">
      <div className="space-y-5">
        {notice ? (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <span>{notice.message}</span>
            {notice.tone === 'warning' && onViewMissingTimesheets ? <Button size="sm" variant="secondary" icon="eye" onClick={onViewMissingTimesheets}>View Unsubmitted</Button> : null}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-xl border-2 border-blue-300 bg-gradient-to-br from-white to-blue-50/70 shadow-md shadow-blue-900/10 ring-1 ring-blue-100">
              <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 px-5 py-3 text-center text-sm font-bold uppercase tracking-[0.18em] text-white">Work week · {period}</div>
              <dl className="grid text-base sm:grid-cols-2">
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
                  <div key={label} className="grid min-w-0 grid-cols-[10rem_minmax(0,1fr)] items-center border-b border-blue-100 px-5 py-3.5 even:sm:border-l even:sm:border-blue-100">
                    <dt className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-blue-700">{label}</dt><dd className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-slate-950" title={String(value)}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Weekly hours</p>
                {groupedTimesheets.length ? (
                  <span className="text-xs font-semibold text-slate-500">
                    {groupedTimesheets.length} timesheets
                  </span>
                ) : null}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[50rem] border-collapse text-center text-[11px]">
                <thead className="bg-slate-900 text-white">
                  <tr><th className="w-20 border-r border-slate-600 px-2 py-2 text-left">Entry</th>{days.map((day) => <th key={day.date} className="border-r border-slate-600 px-1.5 py-1.5"><span className="block font-bold">{dayLabel(day.date).split(',')[0]}</span><span className="block font-normal text-slate-300">{day.date}</span></th>)}<th className="px-1.5 py-1.5">TH</th><th className="px-1.5 py-1.5">RH</th><th className="px-1.5 py-1.5">OT</th><th className="w-28 px-1.5 py-1.5">Details</th></tr>
                </thead>
                <tbody>
                  {groupedTimesheets.length ? <>{groupedTimesheets.map((option, optionIndex) => {
                    const optionDays = getDays(option);
                    const optionTotal = Number(option.totalHours ?? 0);
                    const expanded = expandedTimesheetIds.includes(option.id);
                    const optionMaxSessions = Math.max(1, ...optionDays.map((day) => day.entries.length));
                    return (
                      <GroupedTimesheetRows
                        key={option.id}
                        index={optionIndex}
                        timesheet={option}
                        days={optionDays}
                        totalHours={optionTotal}
                        expanded={expanded}
                        maxSessions={optionMaxSessions}
                        onToggle={() => setExpandedTimesheetIds((current) =>
                          current.includes(option.id)
                            ? current.filter((id) => id !== option.id)
                            : [...current, option.id],
                        )}
                      />
                    );
                  })}<GroupedTimesheetCombinedRow timesheets={groupedTimesheets} days={days} /></> : (
                    <>
                      {showDetails ? Array.from({ length: maxSessions }, (_, sessionIndex) => (
                        <TimesheetSessionRows key={sessionIndex} sessionIndex={sessionIndex} days={days} showTotals={sessionIndex === 0} totals={{ totalHours: editedTotalHours, regularHours: displayedRegularHours, overtimeHours: displayedOvertimeHours }} detailsColumn />
                      )) : null}
                      <tr className="border-t-2 border-slate-800 bg-slate-50"><th className="px-2 py-2 text-left font-bold text-slate-700">Hours</th>{days.map((day) => <td key={day.date} className="border-l border-slate-200 px-1.5 py-1.5 font-bold text-slate-900">{editing ? <input type="number" min="0" max="24" step="any" value={dailyHours[day.date] ?? ''} onChange={(event) => setDailyHours((current) => ({ ...current, [day.date]: event.target.value }))} className="h-8 w-16 rounded-md border border-blue-300 bg-white px-1.5 text-center text-xs font-bold outline-none focus:ring-2 focus:ring-blue-400" aria-label={`Hours for ${day.date}`} /> : day.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0).toFixed(2)}</td>)}<td className="border-l border-slate-300 font-bold">{editedTotalHours.toFixed(2)}</td><td className="border-l border-slate-300 font-bold">{displayedRegularHours.toFixed(2)}</td><td className="border-l border-slate-300 font-bold text-amber-700">{displayedOvertimeHours.toFixed(2)}</td><td className="border-l border-slate-300 px-1.5 py-1"><button type="button" onClick={() => setShowDetails((current) => !current)} className="w-full rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700">{showDetails ? 'Hide Details' : 'Show Details'}</button></td></tr>
                    </>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white">
              <div className="border-b border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer delivery history</p>{timesheet.deliveries?.length ? <div className="mt-2 space-y-2">{timesheet.deliveries.map((delivery) => <p key={`${delivery.batchId}-${delivery.sentAt}`} className="text-sm text-slate-700">Sent to <strong>{delivery.recipientEmail}</strong> on {formatDateTime(delivery.sentAt)} by {delivery.sentBy?.name ?? 'Administrator'}.</p>)}</div> : <p className="mt-2 text-sm text-slate-500">Not sent to the customer yet.</p>}</div>
              <div className="p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Office notes</p>{editing ? <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Enter an internal office note" className="mt-2 w-full resize-y rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-400" /> : <p className="mt-2 min-h-10 whitespace-pre-wrap text-sm text-slate-700">{timesheet.officeNotes || 'No office notes recorded.'}</p>}<p className="mt-2 text-xs text-slate-400">Internal only — not shared with employees or customers.</p></div>
            </div>
            {editing && editError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{editError}</div> : null}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-800">Tracking timesheet</p>
              <div className="mt-2"><TrackingItem label="Received from employee" complete={received} detail={received ? formatDateTime(timesheet.createdAt) : 'Waiting for employee submission'} /><TrackingItem label="Approved by office staff" complete={reviewed} detail={timesheet.readyToSend ? formatDateTime(timesheet.readyToSendAt) : reviewed ? 'Approved' : 'Waiting for office review'} /><TrackingItem label="Sent to customer" complete={sent} detail={timesheet.deliveries?.[0] ? `${formatDateTime(timesheet.deliveries[0].sentAt)} · ${timesheet.deliveries[0].sentBy?.name ?? 'Administrator'}` : 'Not sent yet'} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Office notes</p><p className="mt-3 min-h-20 whitespace-pre-wrap text-sm leading-6 text-slate-700">{editing ? notes || 'No office notes recorded.' : timesheet.officeNotes || 'No office notes recorded.'}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">Approved to send</p><p className="mt-1 text-xs text-slate-500">Read-only; updated by the office workflow.</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-lg font-bold ${timesheet.readyToSend ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{timesheet.readyToSend ? '✓' : '—'}</span></div>{timesheet.readyToSendAt ? <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{formatDateTime(timesheet.readyToSendAt)}</p> : null}</div>
          </aside>
        </div>
      </div>

      <ModalFooter>{editing ? <><Button variant="secondary" icon="cancel" onClick={() => { setEditing(false); setEditError(''); }}>Cancel Editing</Button><Button icon="save" loading={saving} onClick={() => void saveEdits()}>Save Hours &amp; Notes</Button></> : <><Button variant="secondary" icon="cancel" onClick={onClose}>Close</Button>{onSaveEdits ? <Button icon="edit" onClick={beginEditing}>Edit Hours &amp; Notes</Button> : onEditHours ? <Button icon="edit" onClick={onEditHours}>Edit Hours</Button> : null}{canSign ? <Button icon="signature" onClick={onSign}>Sign Timesheet</Button> : null}</>}</ModalFooter>
    </Modal>
  );
}

function GroupedTimesheetRows({
  index,
  timesheet,
  days,
  totalHours,
  expanded,
  maxSessions,
  onToggle,
}: {
  index: number;
  timesheet: Timesheet;
  days: DayColumn[];
  totalHours: number;
  expanded: boolean;
  maxSessions: number;
  onToggle: () => void;
}) {
  const regularHours = Math.min(40, totalHours);
  const overtimeHours = Math.max(0, totalHours - 40);
  const totals = { totalHours, regularHours, overtimeHours };
  return (
    <>
      <tr className="border-t-2 border-slate-800 bg-slate-50">
        <th className="px-2 py-2 text-left font-bold text-slate-700" title={timesheet.status}>
          Hours {index + 1}
        </th>
        {days.map((day) => (
          <td key={day.date} className="border-l border-slate-200 px-1.5 py-1.5 font-bold text-slate-900">
            {day.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0).toFixed(2)}
          </td>
        ))}
        <td className="border-l border-slate-300 font-bold">{totalHours.toFixed(2)}</td>
        <td className="border-l border-slate-300 font-bold">{regularHours.toFixed(2)}</td>
        <td className="border-l border-slate-300 font-bold text-amber-700">{overtimeHours.toFixed(2)}</td>
        <td className="border-l border-slate-300 px-1.5 py-1">
          <button
            type="button"
            onClick={onToggle}
            className="w-full rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700"
          >
            {expanded ? 'Hide Details' : 'See Details'}
          </button>
        </td>
      </tr>
      {expanded
        ? Array.from({ length: maxSessions }, (_, sessionIndex) => (
            <TimesheetSessionRows
              key={sessionIndex}
              sessionIndex={sessionIndex}
              days={days}
              showTotals={false}
              totals={totals}
              detailsColumn
            />
          ))
        : null}
    </>
  );
}

function GroupedTimesheetCombinedRow({ timesheets, days }: { timesheets: Timesheet[]; days: DayColumn[] }) {
  const totalHours = timesheets.reduce(
    (sum, timesheet) => sum + Number(timesheet.totalHours ?? 0),
    0,
  );
  const regularHours = Math.min(40, totalHours);
  const overtimeHours = Math.max(0, totalHours - 40);
  return (
    <tr className="border-y-2 border-blue-700 bg-blue-50 text-blue-950">
      <th className="px-2 py-2.5 text-left text-xs font-black uppercase">Combined</th>
      {days.map((day) => {
        const hours = timesheets.reduce(
          (sum, timesheet) =>
            sum + (timesheet.entries ?? [])
              .filter((entry) => entry.workDate === day.date)
              .reduce((daySum, entry) => daySum + Number(entry.hours ?? 0), 0),
          0,
        );
        return <td key={day.date} className="border-l border-blue-200 px-1.5 py-2.5 font-black">{hours.toFixed(2)}</td>;
      })}
      <td className="border-l border-blue-300 font-black">{totalHours.toFixed(2)}</td>
      <td className="border-l border-blue-300 font-black">{regularHours.toFixed(2)}</td>
      <td className="border-l border-blue-300 font-black text-amber-700">{overtimeHours.toFixed(2)}</td>
      <td className="border-l border-blue-300 px-1.5 text-[10px] font-bold uppercase text-blue-700">All sheets</td>
    </tr>
  );
}

function TimesheetSessionRows({ sessionIndex, days, showTotals, totals, detailsColumn = false }: { sessionIndex: number; days: DayColumn[]; showTotals: boolean; totals: { totalHours: number; regularHours: number; overtimeHours: number }; detailsColumn?: boolean }) {
  const rows = [
    { label: `Clock in${sessionIndex ? ` ${sessionIndex + 1}` : ''}`, render: (entry?: TimesheetEntry) => formatTime(entry?.attendanceLog?.clockInTime ?? entry?.startTime) },
    { label: 'GPS in', render: (entry?: TimesheetEntry) => <LocationCell entry={entry} direction="in" /> },
    { label: `Clock out${sessionIndex ? ` ${sessionIndex + 1}` : ''}`, render: (entry?: TimesheetEntry) => formatTime(entry?.attendanceLog?.clockOutTime ?? entry?.endTime) },
    { label: 'GPS out', render: (entry?: TimesheetEntry) => <LocationCell entry={entry} direction="out" /> },
  ];
  return <>{rows.map((row, rowIndex) => <tr key={row.label} className={rowIndex === 0 && sessionIndex > 0 ? 'border-t-2 border-slate-400' : 'border-t border-slate-200'}><th className="bg-slate-900 px-2 py-1.5 text-left font-semibold text-white">{row.label}</th>{days.map((day) => <td key={day.date} className="max-w-24 border-l border-slate-200 px-1.5 py-1.5 text-slate-700">{row.render(day.entries[sessionIndex])}</td>)}{showTotals && rowIndex === 0 ? <><td rowSpan={4} className="border-l border-slate-300 bg-slate-50 font-bold">{totals.totalHours.toFixed(2)}</td><td rowSpan={4} className="border-l border-slate-300 bg-slate-50 font-bold">{totals.regularHours.toFixed(2)}</td><td rowSpan={4} className="border-l border-slate-300 bg-slate-50 font-bold text-amber-700">{totals.overtimeHours.toFixed(2)}</td></> : !showTotals ? <><td className="border-l border-slate-200" /><td className="border-l border-slate-200" /><td className="border-l border-slate-200" /></> : null}{detailsColumn ? <td className="border-l border-slate-200" /> : null}</tr>)}</>;
}
