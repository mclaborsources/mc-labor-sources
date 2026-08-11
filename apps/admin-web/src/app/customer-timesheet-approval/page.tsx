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
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <CustomerTimesheetApproval token={token} />;
}
