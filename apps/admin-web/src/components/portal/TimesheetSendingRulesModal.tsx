'use client';

import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';

export function TimesheetSendingRulesModal({
  open,
  onClose,
  onViewIssues,
  issueCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  onViewIssues?: () => void;
  issueCount?: number;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Timesheet Sending Rules" subtitle="Reference and workflow notes" icon="info" size="xl" centered
      titleClassName="!text-2xl sm:!text-3xl"
      contentClassName="sm:!px-8 sm:!py-6">
      <div className="space-y-6 text-lg leading-relaxed text-slate-700 sm:text-[22px]">
        <ol className="list-decimal space-y-3 pl-7">
          <li>Submit all approved timesheets together whenever possible.</li>
          <li>Send a timesheet separately only when a correction or customer-requested change requires it.</li>
          <li>A timesheet with previous delivery history must be authorized using Resend before another submission.</li>
          <li>Resend authorization requires pass code 3360.</li>
        </ol>
        {onViewIssues ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
            <p className="font-semibold text-blue-950">Workflow issues and notes</p>
            <p className="mt-2 text-base leading-relaxed text-blue-800 sm:text-lg">Review the issue thread or add a new note without expanding this rules window.</p>
            <Button type="button" size="md" variant="secondary" className="mt-4" icon="eye" onClick={onViewIssues}>View Issues{issueCount ? ` (${issueCount})` : ''}</Button>
          </div>
        ) : null}
        <ModalFooter><Button type="button" variant="secondary" onClick={onClose}>Close</Button></ModalFooter>
      </div>
    </Modal>
  );
}
