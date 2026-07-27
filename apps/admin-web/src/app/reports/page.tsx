'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import {
  DashboardSection,
} from '@/components/dashboard';
import {
  HoursReportPanel,
  PortalRecordsPanel,
  PersonCell,
  HoursCell,
  ActionCell,
} from '@/components/portal';
import { Button } from '@/components/ui/Button';
import { Table, Th, Td, ThActions } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api-client';
import { formatEmployeeName } from '@/lib/portal-stats';
import { downloadCsv } from '@/lib/export-csv';
import { WeeklyEmployeeHoursReport } from '@/components/reports/WeeklyEmployeeHoursReport';

export default function ReportsPage() {
  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ['admin-pending-signatures'],
    queryFn: () => api.getAdminPendingSignatures(),
  });

  function exportPending() {
    if (!pending?.length) return;
    downloadCsv(
      'pending-signatures.csv',
      ['Employee', 'Customer', 'Job Site', 'Hours', 'Status'],
      pending.map((ts) => [
        formatEmployeeName(ts.employee),
        ts.customer?.companyName ?? '',
        ts.jobSite?.name ?? '',
        String(ts.totalHours ?? ''),
        ts.status,
      ]),
    );
  }

  return (
    <DashboardLayout heroTitle="Reports" heroImage={BRAND_HERO_IMAGES.timesheets}>
      <BrandPageTitle
        title="Reports"
        description="Operational rollups, pending signatures, and data exports"
      />

      <DashboardSection
        title="Weekly employee hours"
        description="Daily Saturday–Friday hours for every assigned employee, including zero-hour rows"
      >
        <WeeklyEmployeeHoursReport />
      </DashboardSection>

      <DashboardSection
        title="Date-range hours rollup"
        description="Timesheet totals by worker across a custom date range"
      >
        <HoursReportPanel
          scope="admin"
          description="Select a date range to aggregate timesheet hours. Filter by customer or job site as needed."
        />
      </DashboardSection>

      <DashboardSection
        title="Pending signatures"
        description="Timesheets awaiting foreman sign-off"
      >
        {pendingLoading && <LoadingState />}
        {!pendingLoading && pending?.length === 0 ? (
          <EmptyState title="No pending signatures" />
        ) : null}
        {pending && pending.length > 0 ? (
          <>
            <div className="mb-4 flex justify-end">
              <Button variant="secondary" icon="download" size="sm" onClick={exportPending}>
                Export CSV
              </Button>
            </div>
            <PortalRecordsPanel
              title="Awaiting signature"
              count={pending.length}
              countLabel="timesheets"
            >
            <Table hasActions>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Customer</Th>
                  <Th>Job Site</Th>
                  <Th>Hours</Th>
                  <Th>Status</Th>
                  <ThActions />
                </tr>
              </thead>
              <tbody>
                {pending.map((ts) => (
                  <tr key={ts.id}>
                    <Td>
                      <PersonCell name={formatEmployeeName(ts.employee)} />
                    </Td>
                    <Td>{ts.customer?.companyName ?? '—'}</Td>
                    <Td>{ts.jobSite?.name ?? '—'}</Td>
                    <Td>
                      <HoursCell value={ts.totalHours} />
                    </Td>
                    <Td>
                      <Badge status={ts.status} className="rounded-full normal-case" />
                    </Td>
                    <Td>
                      <ActionCell>
                        <Link href="/timesheets">
                          <Button size="sm" variant="softPrimary" icon="eye">
                            Open
                          </Button>
                        </Link>
                      </ActionCell>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </PortalRecordsPanel>
          </>
        ) : null}
      </DashboardSection>

      <DashboardSection title="Quick exports" description="Full lists with CSV export on each page">
        <div className="flex flex-wrap gap-3">
          <Link href="/attendance">
            <Button variant="secondary" icon="calendar">
              Attendance records
            </Button>
          </Link>
          <Link href="/timesheets">
            <Button variant="secondary" icon="signature">
              All timesheets
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Use the Export CSV button on the Attendance and Timesheets pages to download filtered data.
        </p>
      </DashboardSection>
    </DashboardLayout>
  );
}
