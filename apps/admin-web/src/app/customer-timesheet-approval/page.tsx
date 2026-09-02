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
  searchParams: Promise<{ token?: string; action?: string; demo?: string }>;
}) {
  const { token = '', action = '', demo = '' } = await searchParams;
  return <CustomerTimesheetApproval token={token} approveAll={action === 'approve-all'} demo={demo === '1'} />;
}
