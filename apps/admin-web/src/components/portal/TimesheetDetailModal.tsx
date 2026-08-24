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
  onPreviewSignedPdf?: () => Promise<void>;
  onApproveToSend?: () => Promise<void>;
  onSendToCustomer?: () => Promise<void>;
  onSendAllToCustomer?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  showSignAction?: boolean;
  relatedTimesheets?: Timesheet[];
  onSelectTimesheet?: (timesheetId: string) => void | Promise<void>;
  onRemoveEmployeeFromWeek?: (employeeId: string) => Promise<void>;
  layeredView?: boolean;
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

function formatHours(value: number) {
  return Math.abs(value) < 0.000001 ? '' : value.toFixed(2);
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

export function TimesheetDetailModal({
  open,
  onClose,
  timesheet,
  notice,
  onViewMissingTimesheets,
  onEditHours,
  onSaveEdits,
  onSign,
  onPreviewSignedPdf,
  onApproveToSend,
  onSendToCustomer,
  onSendAllToCustomer,
  onRefresh,
  showSignAction = false,
  relatedTimesheets = [],
  onSelectTimesheet,
  onRemoveEmployeeFromWeek,
  layeredView = false,
}: TimesheetDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [dailyHours, setDailyHours] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [workflowAction, setWorkflowAction] = useState<'preview' | 'approve' | 'send' | 'refresh' | ''>('');
  const [workflowError, setWorkflowError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [timesheetHistory, setTimesheetHistory] = useState<string[]>([]);
  const [removeEmployeeTarget, setRemoveEmployeeTarget] = useState<Timesheet | null>(null);
  const [removingEmployee, setRemovingEmployee] = useState(false);
  const [removeEmployeeError, setRemoveEmployeeError] = useState('');
  const [sendChooserOpen, setSendChooserOpen] = useState(false);
  const [sendChooserError, setSendChooserError] = useState('');
  const [singleSendWarning, setSingleSendWarning] = useState(false);
  const [editedAfterOpen, setEditedAfterOpen] = useState(false);

  useEffect(() => {
    if (open) setTimesheetHistory([]);
  }, [open]);

  useEffect(() => {
    if (open) {
      setEditing(false);
      setShowDetails(false);
      setNotes(timesheet?.officeNotes ?? '');
      setEditError('');
      setWorkflowError('');
      setRemoveEmployeeTarget(null);
      setRemoveEmployeeError('');
      setSendChooserOpen(false);
      setSendChooserError('');
      setSingleSendWarning(false);
      setEditedAfterOpen(false);
    }
  }, [open, timesheet?.id]);

  const days = useMemo(() => (timesheet ? getDays(timesheet) : []), [timesheet]);
  if (!timesheet) return null;

  const originalTimesheetId = timesheetHistory[0];
  const originalTimesheet = originalTimesheetId
    ? relatedTimesheets.find((option) => option.id === originalTimesheetId)
    : undefined;

  if (!layeredView && originalTimesheet && onSelectTimesheet) {
    const closeNestedTimesheet = () => {
      setTimesheetHistory([]);
      onSelectTimesheet(originalTimesheet.id);
    };
    return (
      <>
        <TimesheetDetailModal
          open={open}
          onClose={onClose}
          timesheet={originalTimesheet}
          notice={notice}
          onViewMissingTimesheets={onViewMissingTimesheets}
          relatedTimesheets={relatedTimesheets}
          onSelectTimesheet={onSelectTimesheet}
          onRemoveEmployeeFromWeek={onRemoveEmployeeFromWeek}
          layeredView
        />
        <TimesheetDetailModal
          open={open}
          onClose={closeNestedTimesheet}
          timesheet={timesheet}
          onEditHours={onEditHours}
          onSaveEdits={onSaveEdits}
          onSign={onSign}
          onPreviewSignedPdf={onPreviewSignedPdf}
          onApproveToSend={onApproveToSend}
          onSendToCustomer={onSendToCustomer}
          onSendAllToCustomer={onSendAllToCustomer}
          onRefresh={onRefresh}
          showSignAction={showSignAction}
          relatedTimesheets={relatedTimesheets}
          onSelectTimesheet={onSelectTimesheet}
          onRemoveEmployeeFromWeek={onRemoveEmployeeFromWeek}
          layeredView
        />
      </>
    );
  }

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
  const otherCustomerTimesheets = groupedTimesheets.filter((option) => option.id !== timesheet.id);
  const sendGroup = groupedTimesheets.length ? groupedTimesheets : [timesheet];
  const allTimesheetsApproved = sendGroup.every((option) => option.readyToSend === true);
  const rejectedDelivery = timesheet.deliveries
    ?.filter((delivery) => delivery.reviewRequestedAt)
    .sort((left, right) => String(right.reviewRequestedAt).localeCompare(String(left.reviewRequestedAt)))[0];
  const currentWasRejected = Boolean(rejectedDelivery);
  const editedAfterRejection = Boolean(
    rejectedDelivery?.reviewRequestedAt &&
    timesheet.contentEditedAt &&
    new Date(timesheet.contentEditedAt).getTime() > new Date(rejectedDelivery.reviewRequestedAt).getTime(),
  );
  const received = ['SUBMITTED', 'SIGNED', 'SENT', 'APPROVED'].includes(timesheet.status);
  const canSign = showSignAction && onSign && !['SIGNED', 'SENT'].includes(timesheet.status) && !timesheet.signature?.signatureImageUrl;
  const period = timesheet.weekStartDate && timesheet.weekEndDate ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}` : timesheet.workDate ?? '—';
  // The currently opened employee is always the active timesheet. Its blue
  // treatment remains visible in view, detail, and edit modes.
  const activeTimesheet = true;
  const activeSectionClass = activeTimesheet
    ? '!border-blue-600 !bg-blue-200 ring-2 ring-blue-300'
    : '!border-sky-300 bg-sky-50/40 ring-1 ring-sky-100';
  const activeSurfaceClass = activeTimesheet ? '!bg-blue-100' : 'bg-white';

  async function selectRelatedTimesheet(timesheetId: string) {
    const currentTimesheetId = timesheet?.id;
    if (!onSelectTimesheet || !currentTimesheetId || timesheetId === currentTimesheetId) return;
    try {
      await onSelectTimesheet(timesheetId);
      if (!layeredView) setTimesheetHistory((current) => [...current, currentTimesheetId]);
    } catch {
      // The parent displays the creation/loading error and the original modal stays open.
    }
  }

  function closeOrReturn() {
    const previousTimesheetId = timesheetHistory.at(-1);
    if (previousTimesheetId && onSelectTimesheet) {
      setTimesheetHistory((current) => current.slice(0, -1));
      onSelectTimesheet(previousTimesheetId);
      return;
    }
    onClose();
  }

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
      if (Object.keys(changedHours).length > 0 || notes !== (timesheet?.officeNotes ?? '')) setEditedAfterOpen(true);
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save the timesheet changes.');
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow(action: 'preview' | 'approve' | 'send' | 'refresh', callback: () => Promise<void>) {
    setWorkflowAction(action);
    setWorkflowError('');
    try {
      await callback();
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'The action could not be completed.');
    } finally {
      setWorkflowAction('');
    }
  }

  async function sendOnlyCurrent() {
    setSendChooserError('');
    if (currentWasRejected && !editedAfterOpen && !editedAfterRejection) {
      setSendChooserError('This rejected timesheet cannot be resent until its hours or notes have been edited and saved.');
      return;
    }
    if (!timesheet?.readyToSend) {
      setSendChooserError('This timesheet must be approved before it can be sent.');
      return;
    }
    if (!singleSendWarning) {
      setSingleSendWarning(true);
      return;
    }
    if (onSendToCustomer) await runWorkflow('send', onSendToCustomer);
  }

  async function sendAllTimesheets() {
    setSendChooserError('');
    setSingleSendWarning(false);
    if (!allTimesheetsApproved) {
      setSendChooserError('All timesheets must be approved before they can be sent together. Approve every employee timesheet, then try again.');
      return;
    }
    if (onSendAllToCustomer) await runWorkflow('send', onSendAllToCustomer);
  }

  async function removeEmployeeFromWeek() {
    if (!onRemoveEmployeeFromWeek || !removeEmployeeTarget) return;
    setRemovingEmployee(true);
    setRemoveEmployeeError('');
    try {
      await onRemoveEmployeeFromWeek(removeEmployeeTarget.employeeId);
      setRemoveEmployeeTarget(null);
    } catch (error) {
      setRemoveEmployeeError(error instanceof Error ? error.message : 'Could not remove the employee from this week.');
    } finally {
      setRemovingEmployee(false);
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={closeOrReturn}
      title="Weekly Timesheet"
      subtitle={`${formatEmployeeName(timesheet.employee)} · ${period}`}
      icon="clock"
      size="xl"
      fullScreen
      headerCloseLabel="Close"
      contentClassName="overflow-hidden !pt-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="z-20 shrink-0 space-y-1 bg-white pb-1 shadow-[0_8px_14px_-14px_rgba(15,23,42,0.8)]">
            {(onApproveToSend || canSign || workflowError) ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!timesheet.readyToSend && onApproveToSend ? <Button type="button" icon="checkCircle" loading={workflowAction === 'approve'} disabled={Boolean(workflowAction) || !received} onClick={() => void runWorkflow('approve', onApproveToSend)}>Approve to Send</Button> : null}
                {canSign ? <Button type="button" icon="signature" onClick={onSign}>Sign Timesheet</Button> : null}
                {workflowError ? <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{workflowError}</p> : null}
              </div>
            ) : null}
            <div className={`overflow-hidden rounded-xl border-2 border-blue-300 bg-gradient-to-br from-white to-blue-50/70 shadow-md shadow-blue-900/10 ring-1 ring-blue-100 transition-colors ${activeSectionClass}`}>
              <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-white">Work week · {period}</div>
              <dl className={`grid text-sm transition-colors sm:grid-cols-2 ${activeSurfaceClass}`}>
                {[
                  ['Company name', timesheet.customer?.companyName ?? '—'],
                  ['Employee', formatEmployeeName(timesheet.employee)],
                  ['Job name', timesheet.jobSite?.name ?? '—'],
                  ['Job address', timesheet.manualJobAddress ?? timesheet.jobSite?.address ?? '—'],
                  ['Foreman name', timesheet.manualForemanName ?? timesheet.signature?.foremanName ?? timesheet.jobSite?.foremanName ?? '—'],
                  ['Foreman contact', timesheet.signature?.foremanPhone ?? timesheet.jobSite?.foremanPhone ?? timesheet.signature?.foremanEmail ?? timesheet.jobSite?.foremanEmail ?? '—'],
                  ['Scheduled start', timesheet.assignment?.startTime ?? '—'],
                  ['Status', timesheet.status],
                ].map(([label, value]) => (
                  <div key={label} className={`grid min-w-0 grid-cols-[9rem_minmax(0,1fr)] items-center border-b px-4 py-2 even:sm:border-l ${activeTimesheet ? 'border-blue-500 even:sm:border-blue-500' : 'border-blue-300 even:sm:border-blue-300'}`}>
                    <dt className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-blue-700">{label}</dt><dd className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-slate-950" title={String(value)}>{value}</dd>
                  </div>
                ))}
              </dl>
              {timesheet.signature?.foremanNotes ? <div className={`border-t px-4 py-2 ${activeTimesheet ? 'border-blue-500' : 'border-blue-300'}`}><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Foreman note</p><p className="mt-1 whitespace-pre-wrap text-xs font-medium text-slate-800">{timesheet.signature.foremanNotes}</p></div> : null}
            </div>

            <div className={`overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm transition-colors ${activeSectionClass}`}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-slate-400 bg-slate-50 px-3 py-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Weekly hours</p>
                <div className="translate-x-6 flex items-center justify-center gap-2">
                  {editing ? (
                    <>
                      <Button size="sm" variant="secondary" icon="cancel" disabled={saving} onClick={() => { setEditing(false); setEditError(''); }}>Cancel Editing</Button>
                      <Button size="sm" icon="save" loading={saving} className="min-w-[13rem] !border-emerald-700 !bg-emerald-600 !text-white [background-image:none] hover:!bg-emerald-700" onClick={() => void saveEdits()}>Save Hours &amp; Notes</Button>
                    </>
                  ) : (onSaveEdits || onEditHours) ? <Button size="sm" icon="edit" className="min-w-[13rem] !border-amber-600 !bg-amber-500 !text-slate-950 [background-image:none] hover:!bg-amber-600" onClick={onSaveEdits ? beginEditing : onEditHours}>Edit Hours &amp; Notes</Button> : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {onRefresh ? <Button size="sm" variant="secondary" loading={workflowAction === 'refresh'} disabled={Boolean(workflowAction)} onClick={() => void runWorkflow('refresh', onRefresh)}>↻ Refresh</Button> : null}
                  {!editing && (onSendToCustomer || onSendAllToCustomer) ? <Button size="sm" icon="send" className="!border-emerald-700 !bg-emerald-600 !text-white [background-image:none] hover:!bg-emerald-700" onClick={() => { setSendChooserOpen(true); setSendChooserError(''); setSingleSendWarning(false); }}>Send Timesheets / Hours</Button> : null}
                  {!editing && onPreviewSignedPdf ? <Button size="sm" variant="danger" icon="eye" loading={workflowAction === 'preview'} disabled={Boolean(workflowAction)} onClick={() => void runWorkflow('preview', onPreviewSignedPdf)}>View Signed Timesheet</Button> : null}
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[78rem] table-fixed border-collapse text-center text-[11px] [&_td]:!border-slate-400 [&_th]:!border-slate-500">
                <TimesheetColumnWidths dayCount={days.length} />
                <thead className="bg-slate-900 text-[10px] leading-tight text-white">
                  <tr><th className="border-r border-slate-600 px-2 py-1 text-left">Entry / Employee</th>{days.map((day) => <th key={day.date} className="border-r border-slate-600 px-1 py-1"><span className="block font-bold">{dayLabel(day.date).split(',')[0]}</span><span className="block text-[9px] font-normal text-slate-300">{day.date}</span></th>)}<th className="px-1 py-1">TH</th><th className="px-1 py-1">RH</th><th className="px-1 py-1">OT</th><th className="px-1 py-1">Actions</th><th className="px-1 py-1">Received<br />EE</th><th className="px-1 py-1">Approved</th><th className="px-1 py-1">Bulk<br />Send</th><th className="px-1 py-1">Sent to<br />CU</th><th className="px-1 py-1">Rejected</th><th className="px-1 py-1">Approved<br />by CU</th></tr>
                </thead>
                <tbody>
                  {showDetails ? Array.from({ length: maxSessions }, (_, sessionIndex) => (
                    <TimesheetSessionRows key={sessionIndex} sessionIndex={sessionIndex} days={days} showTotals={sessionIndex === 0} totals={{ totalHours: editedTotalHours, regularHours: displayedRegularHours, overtimeHours: displayedOvertimeHours }} detailsColumn highlighted={activeTimesheet} />
                  )) : null}
                  <tr className={`border-t-2 border-slate-800 transition-colors ${activeTimesheet ? 'bg-blue-200' : 'bg-slate-50'}`}><th className="px-2 py-2 text-left font-bold text-slate-700">Hours</th>{days.map((day) => <td key={day.date} className="border-l border-slate-200 px-1.5 py-1.5 font-bold text-slate-900">{editing ? <input type="number" min="0" max="24" step="any" value={dailyHours[day.date] ?? ''} onChange={(event) => setDailyHours((current) => ({ ...current, [day.date]: event.target.value }))} className="h-8 w-16 rounded-md border border-blue-500 bg-white px-1.5 text-center text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" aria-label={`Hours for ${day.date}`} /> : formatHours(day.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0))}</td>)}<td className="border-l border-slate-300 font-bold">{formatHours(editedTotalHours)}</td><td className="border-l border-slate-300 font-bold">{formatHours(displayedRegularHours)}</td><td className="border-l border-slate-300 font-bold text-amber-700">{formatHours(displayedOvertimeHours)}</td><td className="border-l border-slate-300 px-1.5 py-1"><button type="button" onClick={() => setShowDetails((current) => !current)} className="w-full rounded-md bg-blue-700 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-800">{showDetails ? 'Hide Details' : 'Show Details'}</button></td><WorkflowStatusCells timesheet={timesheet} /></tr>
                  <tr>
                    <td colSpan={days.length + 11} className="border-t-2 border-slate-500 p-0 text-left">
                      <div className={`text-left transition-colors ${activeSurfaceClass}`}>
                        <div className="border-b border-slate-400 p-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer delivery history</p>{timesheet.deliveries?.length ? <div className="mt-1 space-y-1.5">{timesheet.deliveries.map((delivery) => <div key={`${delivery.batchId}-${delivery.sentAt}`} className="rounded-md border border-slate-400 p-2 text-xs text-slate-700"><p><span className="mr-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">{delivery.deliveryMode ? `${delivery.deliveryMode} SEND` : 'LEGACY SEND'}</span>Sent to <strong>{delivery.recipientEmail}</strong> on {formatDateTime(delivery.sentAt)} by {delivery.sentBy?.name ?? 'Administrator'}.</p>{delivery.customerApprovedAt ? <p className="mt-1 font-bold text-emerald-700">Customer approved {formatDateTime(delivery.customerApprovedAt)}</p> : null}{delivery.reviewRequestedAt ? <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-1.5 text-amber-900"><p className="font-bold">Customer rejected / requested changes {formatDateTime(delivery.reviewRequestedAt)}</p><p className="mt-0.5 whitespace-pre-wrap">{delivery.reviewComment || 'No comment provided.'}</p></div> : null}</div>)}</div> : <p className="mt-1 text-xs text-slate-500">Not sent to the customer yet.</p>}</div>
                        <div className="p-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Office notes</p>{editing ? <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Enter an internal office note" className="mt-1 w-full resize-y rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-400" /> : <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{timesheet.officeNotes || 'No office notes recorded.'}</p>}<p className="mt-1 text-[10px] text-slate-400">Internal only — not shared with employees or customers.</p></div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            </div>

            {!timesheetHistory.length && otherCustomerTimesheets.length ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-400 bg-white shadow-sm">
                <div className="shrink-0 border-b border-slate-500 bg-slate-100 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">Other customer assignments · {otherCustomerTimesheets.length}</div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[78rem] table-fixed border-collapse text-center text-[11px] [&_td]:!border-slate-400 [&_th]:!border-slate-500">
                    <TimesheetColumnWidths dayCount={days.length} />
                    <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] leading-tight text-white">
                      <tr><th className="border-r border-slate-600 px-2 py-1 text-left">Entry / Employee</th>{days.map((day) => <th key={day.date} className="border-r border-slate-600 px-1 py-1"><span className="block font-bold">{dayLabel(day.date).split(',')[0]}</span><span className="block text-[9px] font-normal text-slate-300">{day.date}</span></th>)}<th className="px-1 py-1">TH</th><th className="px-1 py-1">RH</th><th className="px-1 py-1">OT</th><th className="px-1 py-1">Actions</th><th className="px-1 py-1">Received<br />EE</th><th className="px-1 py-1">Approved</th><th className="px-1 py-1">Bulk<br />Send</th><th className="px-1 py-1">Sent to<br />CU</th><th className="px-1 py-1">Rejected</th><th className="px-1 py-1">Approved<br />by CU</th></tr>
                    </thead>
                    <tbody>{otherCustomerTimesheets.map((option) => <GroupedTimesheetRow key={option.id} timesheet={option} days={days} selected={false} onSelect={onSelectTimesheet ? () => void selectRelatedTimesheet(option.id) : undefined} onRemove={onRemoveEmployeeFromWeek ? () => { setRemoveEmployeeTarget(option); setRemoveEmployeeError(''); } : undefined} />)}</tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {editing && editError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{editError}</div> : null}
          </section>

        </div>
      </div>

    </Modal>
    <Modal
      open={sendChooserOpen}
      onClose={() => {
        if (!workflowAction) {
          setSendChooserOpen(false);
          setSendChooserError('');
          setSingleSendWarning(false);
        }
      }}
      title="Timesheets / Hours"
      subtitle={`${timesheet.customer?.companyName ?? 'Customer'} · ${period}`}
      icon="send"
      size="lg"
    >
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" disabled={Boolean(workflowAction)} onClick={() => void sendOnlyCurrent()}>Only Send This Timesheet</Button>
          <Button type="button" icon="send" loading={workflowAction === 'send'} disabled={Boolean(workflowAction)} onClick={() => void sendAllTimesheets()}>Send All Timesheets</Button>
        </div>
        {singleSendWarning ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Please send all timesheets at one time unless you are handling a single invoice that was rejected. Click “Only Send This Timesheet” again to continue.</div> : null}
        {sendChooserError ? <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800">{sendChooserError}</div> : null}
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-300">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-900 text-white"><tr><th className="px-3 py-2 text-left">Employee</th><th className="w-24 px-2 py-2">Approved</th><th className="w-24 px-2 py-2">Sent to CU</th></tr></thead>
            <tbody>{sendGroup.map((option) => { const status = workflowStatus(option); return <tr key={option.id} className="border-t border-slate-300"><td className="px-3 py-2"><span className="block font-semibold text-slate-800">{formatEmployeeName(option.employee)}</span><span className="text-[10px] text-slate-500">{option.jobSite?.name ?? 'Job site'}</span></td><WorkflowStatusCell complete={status.approved} /><WorkflowStatusCell complete={status.sent} /></tr>; })}</tbody>
          </table>
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" disabled={Boolean(workflowAction)} onClick={() => { setSendChooserOpen(false); setSendChooserError(''); setSingleSendWarning(false); }}>Close</Button>
        </ModalFooter>
      </div>
    </Modal>
    <Modal
      open={Boolean(removeEmployeeTarget)}
      onClose={() => { if (!removingEmployee) { setRemoveEmployeeTarget(null); setRemoveEmployeeError(''); } }}
      title="Remove Employee from Week"
      subtitle={removeEmployeeTarget ? formatEmployeeName(removeEmployeeTarget.employee) : undefined}
      icon="trash"
      tone="danger"
      size="sm"
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>Are you sure you want to remove this employee from this customer for the entire displayed work week?</p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">All matching weekly assignments will be removed. Existing recorded timesheet hours will be preserved.</div>
        {removeEmployeeError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700">{removeEmployeeError}</p> : null}
        <ModalFooter>
          <Button type="button" variant="secondary" disabled={removingEmployee} onClick={() => { setRemoveEmployeeTarget(null); setRemoveEmployeeError(''); }}>Cancel</Button>
          <Button type="button" variant="softDanger" icon="trash" loading={removingEmployee} onClick={() => void removeEmployeeFromWeek()}>Yes, Remove from Whole Week</Button>
        </ModalFooter>
      </div>
    </Modal>
    </>
  );
}

function workflowStatus(timesheet: Timesheet) {
  return {
    received: ['SUBMITTED', 'SIGNED', 'SENT', 'APPROVED'].includes(timesheet.status),
    approved: Boolean(timesheet.readyToSend) || ['SENT', 'APPROVED'].includes(timesheet.status),
    bulkSend: Boolean(timesheet.bulkSendMarked),
    sent: Boolean(timesheet.deliveries?.length) || timesheet.status === 'SENT',
    rejected: Boolean(timesheet.deliveries?.some((delivery) => delivery.reviewRequestedAt)),
    customerApproved: Boolean(timesheet.deliveries?.some((delivery) => delivery.customerApprovedAt)),
  };
}

function WorkflowStatusCell({ complete, compact = false }: { complete: boolean; compact?: boolean }) {
  return (
    <td className={`border-l border-slate-400 px-1 text-center transition-colors ${compact ? 'py-0.5' : 'py-1.5'} ${complete ? 'bg-emerald-50' : 'bg-slate-50/80'}`}>
      <span className={`inline-flex min-w-[2.75rem] items-center justify-center gap-1 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-extrabold shadow-sm ${compact ? 'py-0.5' : 'py-1'} ${complete ? 'border-emerald-400 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-white text-slate-500'}`}>
        <span className={`flex items-center justify-center rounded-full border text-[10px] leading-none ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${complete ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-slate-100 text-slate-400'}`}>{complete ? '✓' : '—'}</span>
        {complete ? '1/1' : '0/1'}
      </span>
    </td>
  );
}

function WorkflowStatusCells({ timesheet, compact = false }: { timesheet: Timesheet; compact?: boolean }) {
  const status = workflowStatus(timesheet);
  return <><WorkflowStatusCell complete={status.received} compact={compact} /><WorkflowStatusCell complete={status.approved} compact={compact} /><WorkflowStatusCell complete={status.bulkSend} compact={compact} /><WorkflowStatusCell complete={status.sent} compact={compact} /><WorkflowStatusCell complete={status.rejected} compact={compact} /><WorkflowStatusCell complete={status.customerApproved} compact={compact} /></>;
}

function TimesheetColumnWidths({ dayCount }: { dayCount: number }) {
  return <colgroup><col style={{ width: '9rem' }} />{Array.from({ length: dayCount }, (_, index) => <col key={`day-${index}`} style={{ width: '5rem' }} />)}<col style={{ width: '2.75rem' }} /><col style={{ width: '2.75rem' }} /><col style={{ width: '2.75rem' }} /><col style={{ width: '9rem' }} />{Array.from({ length: 6 }, (_, index) => <col key={`status-${index}`} style={{ width: '3.5rem' }} />)}</colgroup>;
}

function GroupedTimesheetRow({
  timesheet,
  days,
  selected,
  onSelect,
  onRemove,
}: {
  timesheet: Timesheet;
  days: DayColumn[];
  selected: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
}) {
  const totalHours = Number(timesheet.totalHours ?? 0);
  const regularHours = Math.min(40, totalHours);
  const overtimeHours = Math.max(0, totalHours - 40);
  return (
      <tr className={`border-t-2 border-slate-800 ${selected ? 'bg-blue-50' : 'bg-slate-50'}`}>
        <th className="px-2 py-1 text-left font-bold leading-tight text-slate-700" title={`${timesheet.status} · ${timesheet.jobSite?.name ?? 'No job site'}`}>
          <span className="block max-w-36 truncate">{formatEmployeeName(timesheet.employee)}</span>
          <span className="block max-w-36 truncate text-[9px] font-medium text-slate-500">{timesheet.jobSite?.name ?? timesheet.status}</span>
        </th>
        {days.map((day) => (
          <td key={day.date} className="border-l border-slate-200 px-1.5 py-1 font-bold text-slate-900">
            {formatHours((timesheet.entries ?? []).filter((entry) => entry.workDate === day.date).reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0))}
          </td>
        ))}
        <td className="border-l border-slate-300 font-bold">{formatHours(totalHours)}</td>
        <td className="border-l border-slate-300 font-bold">{formatHours(regularHours)}</td>
        <td className="border-l border-slate-300 font-bold text-amber-700">{formatHours(overtimeHours)}</td>
        <td className="border-l border-slate-300 px-1.5 py-0.5">
          {selected ? <span className="text-[10px] font-bold uppercase text-blue-700">Viewing</span> : <div className="flex items-center justify-center gap-1"><button type="button" onClick={onSelect} disabled={!onSelect} className="rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-default disabled:bg-slate-300">View Timesheet</button>{onRemove ? <button type="button" onClick={onRemove} className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100">Remove</button> : null}</div>}
        </td>
        <WorkflowStatusCells timesheet={timesheet} compact />
      </tr>
  );
}

function TimesheetSessionRows({ sessionIndex, days, showTotals, totals, detailsColumn = false, highlighted = false }: { sessionIndex: number; days: DayColumn[]; showTotals: boolean; totals: { totalHours: number; regularHours: number; overtimeHours: number }; detailsColumn?: boolean; highlighted?: boolean }) {
  const rows = [
    { label: `Clock in${sessionIndex ? ` ${sessionIndex + 1}` : ''}`, render: (entry?: TimesheetEntry) => formatTime(entry?.attendanceLog?.clockInTime ?? entry?.startTime) },
    { label: 'GPS in', render: (entry?: TimesheetEntry) => <LocationCell entry={entry} direction="in" /> },
    { label: `Clock out${sessionIndex ? ` ${sessionIndex + 1}` : ''}`, render: (entry?: TimesheetEntry) => formatTime(entry?.attendanceLog?.clockOutTime ?? entry?.endTime) },
    { label: 'GPS out', render: (entry?: TimesheetEntry) => <LocationCell entry={entry} direction="out" /> },
  ];
  return <>{rows.map((row, rowIndex) => <tr key={row.label} className={`${rowIndex === 0 && sessionIndex > 0 ? 'border-t-2 border-slate-400' : 'border-t border-slate-200'} ${highlighted ? 'bg-blue-100' : 'bg-white'}`}><th className="bg-slate-900 px-2 py-1.5 text-left font-semibold text-white">{row.label}</th>{days.map((day) => <td key={day.date} className="max-w-24 border-l border-slate-200 px-1.5 py-1.5 text-slate-700">{row.render(day.entries[sessionIndex])}</td>)}{showTotals && rowIndex === 0 ? <><td rowSpan={4} className={`border-l border-slate-300 font-bold ${highlighted ? 'bg-blue-200' : 'bg-slate-50'}`}>{formatHours(totals.totalHours)}</td><td rowSpan={4} className={`border-l border-slate-300 font-bold ${highlighted ? 'bg-blue-200' : 'bg-slate-50'}`}>{formatHours(totals.regularHours)}</td><td rowSpan={4} className={`border-l border-slate-300 font-bold text-amber-700 ${highlighted ? 'bg-blue-200' : 'bg-slate-50'}`}>{formatHours(totals.overtimeHours)}</td></> : !showTotals ? <><td className="border-l border-slate-200" /><td className="border-l border-slate-200" /><td className="border-l border-slate-200" /></> : null}{detailsColumn ? <><td className="border-l border-slate-200" />{Array.from({ length: 6 }, (_, index) => <td key={index} className="border-l border-slate-200" />)}</> : null}</tr>)}</>;
}
