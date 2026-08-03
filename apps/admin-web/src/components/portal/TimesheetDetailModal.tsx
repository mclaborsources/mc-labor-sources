'use client';

import { useEffect, useState } from 'react';
import type { Timesheet, TimesheetEntry } from '@/lib/domain-types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { formatEmployeeName } from '@/lib/portal-stats';

interface TimesheetDetailModalProps {
  open: boolean;
  onClose: () => void;
  timesheet: Timesheet | null;
  notice?: {
    tone: 'complete' | 'warning';
    message: string;
  };
  onViewMissingTimesheets?: () => void;
  onEditHours?: () => void;
  onSign?: () => void;
  showSignAction?: boolean;
  relatedTimesheets?: Timesheet[];
  onSelectTimesheet?: (timesheetId: string) => void;
}

function getPeriodDays(timesheet: Timesheet): TimesheetEntry[] {
  if (!timesheet.weekStartDate || !timesheet.weekEndDate) return timesheet.entries ?? [];

  const entriesByDate = new Map((timesheet.entries ?? []).map((entry) => [entry.workDate, entry]));
  const days: TimesheetEntry[] = [];
  const cursor = new Date(`${timesheet.weekStartDate}T00:00:00`);
  const end = new Date(`${timesheet.weekEndDate}T00:00:00`);

  while (cursor <= end) {
    const workDate = cursor.toISOString().slice(0, 10);
    days.push(
      entriesByDate.get(workDate) ?? {
        id: `empty-${workDate}`,
        timesheetId: timesheet.id,
        workDate,
        startTime: '',
        endTime: '',
        breakMinutes: 0,
        hours: 0,
        notes: null,
      },
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
  const [choosingTimesheet, setChoosingTimesheet] = useState(false);
  const [chosenTimesheetId, setChosenTimesheetId] = useState('');

  useEffect(() => {
    if (!open) return;
    setChoosingTimesheet(relatedTimesheets.length > 1);
    setChosenTimesheetId(timesheet?.id ?? relatedTimesheets[0]?.id ?? '');
  }, [open]);

  if (!timesheet) return null;

  if (choosingTimesheet && relatedTimesheets.length > 1 && onSelectTimesheet) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Choose Timesheet"
        subtitle={`${relatedTimesheets.length} timesheets are available for this employee and assignment`}
        icon="eye"
        size="lg"
      >
        <div className="space-y-3">
          {relatedTimesheets.map((option, index) => {
            const optionPeriod =
              option.weekStartDate && option.weekEndDate
                ? `${option.weekStartDate} - ${option.weekEndDate}`
                : option.workDate ?? 'No date';
            const selected = chosenTimesheetId === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 transition ${
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                    : 'border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="timesheet-choice"
                  value={option.id}
                  checked={selected}
                  onChange={() => setChosenTimesheetId(option.id)}
                  className="h-4 w-4 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">Timesheet {index + 1}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {optionPeriod} · {option.totalHours}h
                  </p>
                </div>
                <Badge status={option.status} className="rounded-full normal-case" />
              </label>
            );
          })}
        </div>
        <ModalFooter>
          <Button variant="secondary" icon="cancel" onClick={onClose}>
            Close
          </Button>
          <Button
            icon="eye"
            disabled={!chosenTimesheetId}
            onClick={() => {
              onSelectTimesheet(chosenTimesheetId);
              setChoosingTimesheet(false);
            }}
          >
            View Timesheet
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  const periodLabel =
    timesheet.weekStartDate && timesheet.weekEndDate
      ? `${timesheet.weekStartDate} – ${timesheet.weekEndDate}`
      : timesheet.workDate ?? '—';
  const periodDays = getPeriodDays(timesheet);
  const canSign =
    showSignAction &&
    onSign &&
    timesheet.status !== 'SIGNED' &&
    timesheet.status !== 'SENT' &&
    !timesheet.signature?.signatureImageUrl;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Timesheet Detail"
      subtitle="Read-only review of the complete timesheet"
      icon="eye"
      size="lg"
    >
      <div className="space-y-5">
        {relatedTimesheets.length > 1 && onSelectTimesheet ? (
          <div className="hidden rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <label
              htmlFor="assignment-timesheet-selector"
              className="mb-2 block text-xs font-semibold uppercase tracking-widest text-blue-700"
            >
              {timesheet.isStandaloneManual
                ? 'Manual timesheets in this group'
                : 'Timesheets for this assignment'}
            </label>
            <select
              id="assignment-timesheet-selector"
              value={timesheet.id}
              onChange={(event) => onSelectTimesheet(event.target.value)}
              className="h-11 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {relatedTimesheets.map((option, index) => {
                const optionPeriod =
                  option.weekStartDate && option.weekEndDate
                    ? `${option.weekStartDate} – ${option.weekEndDate}`
                    : option.workDate ?? 'No date';
                return (
                  <option key={option.id} value={option.id}>
                    Timesheet {index + 1} · {optionPeriod} · {option.totalHours}h · {option.status}
                  </option>
                );
              })}
            </select>
            <p className="mt-2 text-xs text-blue-700">
              {timesheet.isStandaloneManual
                ? `${relatedTimesheets.length} manual timesheets were submitted for this employee, job, and work week.`
                : `${relatedTimesheets.length} timesheets are associated with this employee and assignment.`}
            </p>
          </div>
        ) : null}

        {relatedTimesheets.length > 1 && onSelectTimesheet ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              icon="eye"
              onClick={() => setChoosingTimesheet(true)}
            >
              Choose Another Timesheet
            </Button>
          </div>
        ) : null}

        {notice ? (
          <div
            className={
              notice.tone === 'complete'
                ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800'
                : 'rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900'
            }
          >
            <p>{notice.message}</p>
            {notice.tone === 'warning' && onViewMissingTimesheets ? (
              <Button
                size="sm"
                variant="secondary"
                icon="eye"
                className="mt-3"
                onClick={onViewMissingTimesheets}
              >
                View Unsubmitted Timesheets
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Employee</p>
            <p className="font-semibold text-slate-800">{formatEmployeeName(timesheet.employee)}</p>
            {timesheet.isStandaloneManual ? (
              <p className="mt-1 text-xs font-semibold text-blue-600">Manual timesheet</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Company</p>
            <p className="font-semibold text-slate-800">{timesheet.customer?.companyName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Job Site</p>
            <p className="font-semibold text-slate-800">{timesheet.jobSite?.name ?? '—'}</p>
            {timesheet.manualJobAddress ? (
              <p className="mt-1 text-xs text-slate-500">{timesheet.manualJobAddress}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Period</p>
            <p className="font-semibold text-slate-800">{periodLabel}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Hours</p>
            <p className="font-semibold text-primary">{timesheet.totalHours}h</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
            <Badge status={timesheet.status} className="rounded normal-case" />
          </div>
        </div>

        {timesheet.notes ? (
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Employee note
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{timesheet.notes}</p>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Time entries
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Start</th>
                  <th className="pb-2">End</th>
                  <th className="pb-2">Entry</th>
                  <th className="pb-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {periodDays.map((entry) => {
                  const hasTime = Number(entry.hours) > 0 || Boolean(entry.startTime || entry.endTime);
                  return (
                    <tr key={entry.id} className="border-t border-slate-50">
                      <td className="py-2">{entry.workDate}</td>
                      <td className="py-2">{entry.startTime || '—'}</td>
                      <td className="py-2">{entry.endTime || '—'}</td>
                      <td className="py-2 text-slate-500">{hasTime ? 'Recorded' : 'No logged time'}</td>
                      <td className="py-2 text-right font-medium">{entry.hours}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {timesheet.signature ? (
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Foreman signature
            </p>
            <p className="text-sm text-slate-700">
              {timesheet.signature.foremanName}
              {timesheet.signature.foremanEmail ? ` · ${timesheet.signature.foremanEmail}` : ''}
            </p>
            {timesheet.signature.signatureImageUrl ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
                <img
                  src={timesheet.signature.signatureImageUrl}
                  alt={`Signature of ${timesheet.signature.foremanName}`}
                  className="h-28 w-full object-contain object-left"
                />
              </div>
            ) : (
              <p className="mt-2 text-xs italic text-slate-500">
                Submitted without a drawn foreman signature.
              </p>
            )}
            {timesheet.signature.signedAt ? (
              <p className="mt-2 text-xs text-slate-500">
                Signed {new Date(timesheet.signature.signedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Customer delivery history
          </p>
          {timesheet.deliveries?.length ? (
            <div className="space-y-3">
              {timesheet.deliveries.map((delivery) => (
                <dl
                  key={`${delivery.batchId}-${delivery.sentAt}`}
                  className="grid gap-3 rounded-lg bg-emerald-50 p-3 text-sm sm:grid-cols-2"
                >
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Sent to</dt>
                    <dd className="font-medium text-slate-700">{delivery.recipientEmail}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Sent at</dt>
                    <dd className="font-medium text-slate-700">
                      {new Date(delivery.sentAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Sent by</dt>
                    <dd className="font-medium text-slate-700">
                      {delivery.sentBy?.name ?? 'Administrator'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Timesheets</dt>
                    <dd className="font-medium text-slate-700">{delivery.timesheetCount}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase text-slate-400">Subject</dt>
                    <dd className="font-medium text-slate-700">{delivery.subject}</dd>
                  </div>
                </dl>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">This timesheet has not been sent to a customer.</p>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" icon="cancel" onClick={onClose}>
          Close
        </Button>
        {onEditHours ? (
          <Button icon="edit" onClick={onEditHours}>
            Edit Hours
          </Button>
        ) : null}
        {canSign ? (
          <Button icon="signature" onClick={onSign}>
            Sign Timesheet
          </Button>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
