import type { Metadata } from 'next';
import { CustomerTimesheetApproval } from './CustomerTimesheetApproval';

export const metadata: Metadata = {
  title: 'Approve Timesheets',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function CustomerTimesheetApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; timesheet?: string; intent?: string; demo?: string }>;
}) {
  const { token = '', timesheet = '', intent = '', demo = '' } = await searchParams;
  return <CustomerTimesheetApproval token={token} selectedTimesheetId={timesheet} intent={intent === 'approve' || intent === 'dispute' ? intent : undefined} demo={demo === '1'} />;
}
