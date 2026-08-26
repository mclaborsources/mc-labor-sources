'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
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
import { Modal, ModalFooter } from '@/components/ui/Modal';

type ReportModal = 'rollup' | 'pending' | 'exports' | null;

export default function ReportsPage() {
  const [openReport, setOpenReport] = useState<ReportModal>(null);
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
    <DashboardLayout
      heroTitle="Reports"
      heroImage={BRAND_HERO_IMAGES.timesheets}
      contentClassName="brand-container flex min-h-0 flex-col py-2 lg:fixed lg:inset-x-0 lg:bottom-0 lg:top-[65px] lg:h-auto lg:overflow-hidden"
    >
      <BrandPageTitle
        title="Reports"
        description="Operational rollups, pending signatures, and data exports"
        compact
      />

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <Button icon="clock" onClick={() => setOpenReport('rollup')}>
            Date-range Rollup
          </Button>
          <Button icon="signature" onClick={() => setOpenReport('pending')}>
            Pending Signatures{pending?.length ? ` (${pending.length})` : ''}
          </Button>
          <Button icon="download" onClick={() => setOpenReport('exports')}>
            Quick Exports
          </Button>
        </div>
        <div className="mb-2 shrink-0">
          <h2 className="brand-section-title">Weekly employee hours</h2>
          <p className="mt-1 text-xs text-gray-500">
            Daily Saturday–Friday hours for every assigned employee, including zero-hour rows
          </p>
        </div>
        <WeeklyEmployeeHoursReport />
      </section>

      <Modal
        open={openReport === 'rollup'}
        onClose={() => setOpenReport(null)}
        title="Date-range Hours Rollup"
        subtitle="Timesheet totals by worker across a custom date range"
        icon="clock"
        size="xl"
      >
        <HoursReportPanel
          scope="admin"
          description="Select a date range to aggregate timesheet hours. Filter by customer or job site as needed."
        />
        <ModalFooter>
          <Button variant="secondary" onClick={() => setOpenReport(null)}>Close</Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={openReport === 'pending'}
        onClose={() => setOpenReport(null)}
        title="Pending Signatures"
        subtitle="Timesheets awaiting foreman sign-off"
        icon="signature"
        size="xl"
      >
        {pendingLoading && <LoadingState />}
        {!pendingLoading && pending?.length === 0 ? (
          <EmptyState title="No pending signatures" />
        ) : null}
        {pending && pending.length > 0 ? (
          <>
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" icon="download" size="sm" onClick={exportPending}>
                Export CSV
              </Button>
            </div>
            <PortalRecordsPanel
              title="Awaiting signature"
              count={pending.length}
              countLabel="timesheets"
            >
            <Table hasActions containerClassName="max-h-[60vh] overflow-y-auto">
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
        <ModalFooter>
          <Button variant="secondary" onClick={() => setOpenReport(null)}>Close</Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={openReport === 'exports'}
        onClose={() => setOpenReport(null)}
        title="Quick Exports"
        subtitle="Open a full record list and export its filtered data"
        icon="download"
        size="md"
      >
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
        <ModalFooter>
          <Button variant="secondary" onClick={() => setOpenReport(null)}>Close</Button>
        </ModalFooter>
      </Modal>
    </DashboardLayout>
  );
}
