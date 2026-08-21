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
  onDelete?: () => Promise<void>;
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
  onPreviewSignedPdf,
  onApproveToSend,
  onSendToCustomer,
  onDelete,
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
  const [workflowAction, setWorkflowAction] = useState<'preview' | 'approve' | 'send' | ''>('');
  const [workflowError, setWorkflowError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [timesheetHistory, setTimesheetHistory] = useState<string[]>([]);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [removeEmployeeTarget, setRemoveEmployeeTarget] = useState<Timesheet | null>(null);
  const [removingEmployee, setRemovingEmployee] = useState(false);
  const [removeEmployeeError, setRemoveEmployeeError] = useState('');

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
      setDeleteConfirmationOpen(false);
      setDeleteError('');
      setRemoveEmployeeTarget(null);
      setRemoveEmployeeError('');
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
          onDelete={onDelete}
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
  const received = ['SUBMITTED', 'SIGNED', 'SENT', 'APPROVED'].includes(timesheet.status);
  const reviewed = Boolean(timesheet.readyToSend) || ['SENT', 'APPROVED'].includes(timesheet.status);
  const sent = Boolean(timesheet.deliveries?.length) || timesheet.status === 'SENT';
  const customerApproval = timesheet.deliveries?.find((delivery) => delivery.customerApprovedAt);
  const customerReviewRequest = timesheet.deliveries?.find((delivery) => delivery.reviewRequestedAt);
  const canDelete = Boolean(onDelete) && !sent && !['SENT', 'APPROVED'].includes(timesheet.status);
  const canSign = showSignAction && onSign && !['SIGNED', 'SENT'].includes(timesheet.status) && !timesheet.signature?.signatureImageUrl;
  const period = timesheet.weekStartDate && timesheet.weekEndDate ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}` : timesheet.workDate ?? '—';

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
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save the timesheet changes.');
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow(action: 'preview' | 'approve' | 'send', callback: () => Promise<void>) {
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

  async function deleteTimesheet() {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete();
      setDeleteConfirmationOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the timesheet.');
    } finally {
      setDeleting(false);
    }
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
    <Modal open={open} onClose={closeOrReturn} title="Weekly Timesheet" subtitle={`${formatEmployeeName(timesheet.employee)} · ${period}`} icon="clock" size="xl" fullScreen headerCloseLabel="Close">
      <div className="space-y-5">
        {deleteConfirmationOpen ? (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">Permanently delete this unsent timesheet?</p>
            <p className="mt-1">Its hours, entries, and signature will be removed. The administrator, deletion time, and a snapshot will remain in the audit log.</p>
            {deleteError ? <p className="mt-2 font-semibold text-red-700">{deleteError}</p> : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={deleting} onClick={() => { setDeleteConfirmationOpen(false); setDeleteError(''); }}>Cancel</Button><Button type="button" variant="softDanger" icon="trash" loading={deleting} onClick={() => void deleteTimesheet()}>Delete Timesheet Permanently</Button></div>
          </div>
        ) : null}
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
                  ['Foreman contact', timesheet.signature?.foremanPhone ?? timesheet.jobSite?.foremanPhone ?? timesheet.signature?.foremanEmail ?? timesheet.jobSite?.foremanEmail ?? '—'],
                  ['Scheduled start', timesheet.assignment?.startTime ?? '—'],
                  ['Status', timesheet.status],
                ].map(([label, value]) => (
                  <div key={label} className="grid min-w-0 grid-cols-[10rem_minmax(0,1fr)] items-center border-b border-blue-100 px-5 py-3.5 even:sm:border-l even:sm:border-blue-100">
                    <dt className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-blue-700">{label}</dt><dd className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold text-slate-950" title={String(value)}>{value}</dd>
                  </div>
                ))}
              </dl>
              {timesheet.signature?.foremanNotes ? <div className="border-t border-blue-100 px-5 py-3.5"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Foreman note</p><p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{timesheet.signature.foremanNotes}</p></div> : null}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Weekly hours</p>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[50rem] border-collapse text-center text-[11px]">
                <thead className="bg-slate-900 text-[10px] leading-tight text-white">
                  <tr><th className="w-36 border-r border-slate-600 px-2 py-1 text-left">Entry / Employee</th>{days.map((day) => <th key={day.date} className="border-r border-slate-600 px-1 py-1"><span className="block font-bold">{dayLabel(day.date).split(',')[0]}</span><span className="block text-[9px] font-normal text-slate-300">{day.date}</span></th>)}<th className="px-1 py-1">TH</th><th className="px-1 py-1">RH</th><th className="px-1 py-1">OT</th><th className="w-44 px-1 py-1">Actions</th></tr>
                </thead>
                <tbody>
                  {showDetails ? Array.from({ length: maxSessions }, (_, sessionIndex) => (
                    <TimesheetSessionRows key={sessionIndex} sessionIndex={sessionIndex} days={days} showTotals={sessionIndex === 0} totals={{ totalHours: editedTotalHours, regularHours: displayedRegularHours, overtimeHours: displayedOvertimeHours }} detailsColumn />
                  )) : null}
                  <tr className="border-t-2 border-slate-800 bg-slate-50"><th className="px-2 py-2 text-left font-bold text-slate-700">Hours</th>{days.map((day) => <td key={day.date} className="border-l border-slate-200 px-1.5 py-1.5 font-bold text-slate-900">{editing ? <input type="number" min="0" max="24" step="any" value={dailyHours[day.date] ?? ''} onChange={(event) => setDailyHours((current) => ({ ...current, [day.date]: event.target.value }))} className="h-8 w-16 rounded-md border border-blue-300 bg-white px-1.5 text-center text-xs font-bold outline-none focus:ring-2 focus:ring-blue-400" aria-label={`Hours for ${day.date}`} /> : day.entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0).toFixed(2)}</td>)}<td className="border-l border-slate-300 font-bold">{editedTotalHours.toFixed(2)}</td><td className="border-l border-slate-300 font-bold">{displayedRegularHours.toFixed(2)}</td><td className="border-l border-slate-300 font-bold text-amber-700">{displayedOvertimeHours.toFixed(2)}</td><td className="border-l border-slate-300 px-1.5 py-1"><button type="button" onClick={() => setShowDetails((current) => !current)} className="w-full rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700">{showDetails ? 'Hide Details' : 'Show Details'}</button></td></tr>
                  {!timesheetHistory.length && otherCustomerTimesheets.length ? <><tr className="border-y border-slate-300 bg-slate-100"><td colSpan={days.length + 5} className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">Other customer assignments · {otherCustomerTimesheets.length}</td></tr>{otherCustomerTimesheets.map((option) => <GroupedTimesheetRow key={option.id} timesheet={option} days={days} selected={false} onSelect={onSelectTimesheet ? () => void selectRelatedTimesheet(option.id) : undefined} onRemove={onRemoveEmployeeFromWeek ? () => { setRemoveEmployeeTarget(option); setRemoveEmployeeError(''); } : undefined} />)}</> : null}
                </tbody>
              </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 bg-white">
              <div className="border-b border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer delivery history</p>{timesheet.deliveries?.length ? <div className="mt-2 space-y-3">{timesheet.deliveries.map((delivery) => <div key={`${delivery.batchId}-${delivery.sentAt}`} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><p><span className="mr-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{delivery.deliveryMode ? `${delivery.deliveryMode} SEND` : 'LEGACY SEND'}</span>Sent to <strong>{delivery.recipientEmail}</strong> on {formatDateTime(delivery.sentAt)} by {delivery.sentBy?.name ?? 'Administrator'}.</p>{delivery.customerApprovedAt ? <p className="mt-2 font-bold text-emerald-700">Customer approved {formatDateTime(delivery.customerApprovedAt)}</p> : null}{delivery.reviewRequestedAt ? <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900"><p className="font-bold">Customer rejected / requested changes {formatDateTime(delivery.reviewRequestedAt)}</p><p className="mt-1 whitespace-pre-wrap">{delivery.reviewComment || 'No comment provided.'}</p></div> : null}</div>)}</div> : <p className="mt-2 text-sm text-slate-500">Not sent to the customer yet.</p>}</div>
              <div className="p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Office notes</p>{editing ? <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Enter an internal office note" className="mt-2 w-full resize-y rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-400" /> : <p className="mt-2 min-h-10 whitespace-pre-wrap text-sm text-slate-700">{timesheet.officeNotes || 'No office notes recorded.'}</p>}<p className="mt-2 text-xs text-slate-400">Internal only — not shared with employees or customers.</p></div>
            </div>
            {editing && editError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{editError}</div> : null}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-800">Tracking timesheet</p>
              <div className="mt-2 border-b border-blue-200/70 pb-1">
                <TrackingItem label="Approved by customer" complete={Boolean(customerApproval)} detail={customerApproval?.customerApprovedAt ? formatDateTime(customerApproval.customerApprovedAt) : customerReviewRequest?.reviewRequestedAt ? `Rejected / changes requested ${formatDateTime(customerReviewRequest.reviewRequestedAt)}${customerReviewRequest.reviewComment ? ` · ${customerReviewRequest.reviewComment}` : ''}` : sent ? 'Waiting for customer approval' : 'Not sent yet'} />
              </div>
              <div className="mt-2"><TrackingItem label="Received from employee" complete={received} detail={received ? formatDateTime(timesheet.createdAt) : 'Waiting for employee submission'} /><TrackingItem label="Approved by office staff" complete={reviewed} detail={timesheet.readyToSend ? `${formatDateTime(timesheet.readyToSendAt)} · ${timesheet.readyToSendBy?.name ?? 'Office staff'}` : reviewed ? 'Approved' : 'Waiting for office review'} /><TrackingItem label="Marked for bulk send" complete={Boolean(timesheet.bulkSendMarked)} detail={timesheet.bulkSendMarked ? `${formatDateTime(timesheet.bulkSendMarkedAt)} · ${timesheet.bulkSendMarkedBy?.name ?? 'Administrator'}` : 'Not marked for bulk send'} /><TrackingItem label="Sent to customer" complete={sent} detail={timesheet.deliveries?.[0] ? `${formatDateTime(timesheet.deliveries[0].sentAt)} · ${timesheet.deliveries[0].sentBy?.name ?? 'Administrator'} · ${timesheet.deliveries[0].deliveryMode ? `${timesheet.deliveries[0].deliveryMode.toLowerCase()} send` : 'legacy send'}` : 'Not sent yet'} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Office notes</p><p className="mt-3 min-h-20 whitespace-pre-wrap text-sm leading-6 text-slate-700">{editing ? notes || 'No office notes recorded.' : timesheet.officeNotes || 'No office notes recorded.'}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">Approved to send</p><p className="mt-1 text-xs text-slate-500">{timesheet.readyToSend ? `${timesheet.readyToSendBy?.name ?? 'Office staff'} · ${formatDateTime(timesheet.readyToSendAt)}` : 'Waiting for office approval.'}</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-lg font-bold ${timesheet.readyToSend ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{timesheet.readyToSend ? '✓' : '—'}</span></div><div className="mt-4 grid gap-2">{onPreviewSignedPdf ? <Button type="button" variant="secondary" icon="eye" loading={workflowAction === 'preview'} disabled={Boolean(workflowAction)} onClick={() => void runWorkflow('preview', onPreviewSignedPdf)}>View Signed Customer PDF</Button> : null}{timesheet.readyToSend && onSendToCustomer ? <Button type="button" icon="send" loading={workflowAction === 'send'} disabled={Boolean(workflowAction)} onClick={() => void runWorkflow('send', onSendToCustomer)}>Send This Timesheet to Customer</Button> : null}{!timesheet.readyToSend && onApproveToSend ? <Button type="button" icon="checkCircle" loading={workflowAction === 'approve'} disabled={Boolean(workflowAction) || !received} onClick={() => void runWorkflow('approve', onApproveToSend)}>Approve to Send</Button> : null}{workflowError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{workflowError}</p> : null}</div></div>
          </aside>
        </div>
      </div>

      <ModalFooter>{editing ? <><Button variant="secondary" icon="cancel" onClick={() => { setEditing(false); setEditError(''); }}>Cancel Editing</Button><Button icon="save" loading={saving} onClick={() => void saveEdits()}>Save Hours &amp; Notes</Button></> : <>{canDelete ? <Button variant="softDanger" icon="trash" onClick={() => setDeleteConfirmationOpen(true)}>Delete Timesheet</Button> : null}<Button variant="secondary" icon="cancel" onClick={closeOrReturn}>Close</Button>{onSaveEdits ? <Button icon="edit" onClick={beginEditing}>Edit Hours &amp; Notes</Button> : onEditHours ? <Button icon="edit" onClick={onEditHours}>Edit Hours</Button> : null}{canSign ? <Button icon="signature" onClick={onSign}>Sign Timesheet</Button> : null}</>}</ModalFooter>
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
        <th className="px-2 py-2 text-left font-bold text-slate-700" title={`${timesheet.status} · ${timesheet.jobSite?.name ?? 'No job site'}`}>
          <span className="block max-w-36 truncate">{formatEmployeeName(timesheet.employee)}</span>
          <span className="block max-w-36 truncate text-[9px] font-medium text-slate-500">{timesheet.jobSite?.name ?? timesheet.status}</span>
        </th>
        {days.map((day) => (
          <td key={day.date} className="border-l border-slate-200 px-1.5 py-1.5 font-bold text-slate-900">
            {(timesheet.entries ?? []).filter((entry) => entry.workDate === day.date).reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0).toFixed(2)}
          </td>
        ))}
        <td className="border-l border-slate-300 font-bold">{totalHours.toFixed(2)}</td>
        <td className="border-l border-slate-300 font-bold">{regularHours.toFixed(2)}</td>
        <td className="border-l border-slate-300 font-bold text-amber-700">{overtimeHours.toFixed(2)}</td>
        <td className="border-l border-slate-300 px-1.5 py-1">
          {selected ? <span className="text-[10px] font-bold uppercase text-blue-700">Viewing</span> : <div className="flex items-center justify-center gap-1"><button type="button" onClick={onSelect} disabled={!onSelect} className="rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-default disabled:bg-slate-300">View Timesheet</button>{onRemove ? <button type="button" onClick={onRemove} className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-700 hover:bg-red-100">Remove</button> : null}</div>}
        </td>
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
