'use client';

import { Button } from '@/components/ui/Button';
import { EditableHelpRuleModal } from '@/components/portal/EditableHelpRuleModal';

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
    <EditableHelpRuleModal
      open={open}
      onClose={onClose}
      ruleId="timesheet-sending-rules"
      defaultTitle="Timesheet Sending Rules"
      defaultContent={`1. Submit all approved timesheets together whenever possible.\n\n2. Send a timesheet separately only when a correction or customer-requested change requires it.\n\n3. A timesheet with previous delivery history must be authorized using Resend before another submission.\n\n4. Resend authorization requires pass code 3360.`}
      afterContent={onViewIssues ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
            <p className="font-semibold text-blue-950">Workflow issues and notes</p>
            <p className="mt-2 text-base leading-relaxed text-blue-800 sm:text-lg">Review the issue thread or add a new note without expanding this rules window.</p>
            <Button type="button" size="md" variant="secondary" className="mt-4" icon="eye" onClick={onViewIssues}>View Issues{issueCount ? ` (${issueCount})` : ''}</Button>
          </div>
        ) : undefined}
    />
  );
}
