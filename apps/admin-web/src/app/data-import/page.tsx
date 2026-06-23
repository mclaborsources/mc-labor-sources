'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { ImportWorkflow } from '@/components/import/ImportWorkflow';
import { WorkingWeekSelector } from '@/components/import/WorkingWeekSelector';
import {
  parseAssignmentPaste,
  parseCustomerPaste,
  parseEmployeePaste,
  parseJobPaste,
} from '@/components/import/import-parsers';
import { api } from '@/lib/api-client';
import { getCurrentWorkingWeek } from '@/lib/working-week';
import { cn } from '@/lib/utils';

type ImportTab = 'employee' | 'customer' | 'job' | 'assignment';

const TABS: { id: ImportTab; label: string }[] = [
  { id: 'employee', label: 'Employees' },
  { id: 'customer', label: 'Customers' },
  { id: 'job', label: 'Jobs' },
  { id: 'assignment', label: 'Assignments' },
];

const HELP: Record<ImportTab, string> = {
  employee:
    'Paste employee rows from Excel/CSV with headers (tab- or comma-separated). Employee ID, names, contact, trade, and pay/bill rates required. Status is optional — defaults to Active; omit Status to preserve manual Inactive from the Employees page.',
  customer:
    'Paste one wide row per customer with Customer ID, Salesman, address fields, and up to 10 contact columns (Contact N First Name, etc.). Copy from Excel/CSV with headers.',
  job:
    'Paste one wide row per job with Job ID, Customer ID, address, start date, status, and up to 20 foreman columns. Copy from Excel/CSV with headers.',
  assignment:
    'Paste assignment rows with Employee ID, Customer ID, and Job ID. Conflicts are checked only for the selected working week (Sat–Fri). On Friday/Saturday when planning next week, choose Next Working Week.',
};

export default function DataImportPage() {
  const [tab, setTab] = useState<ImportTab>('employee');
  const initialWeek = useMemo(() => getCurrentWorkingWeek(), []);
  const [workingWeek, setWorkingWeek] = useState({
    weekStart: initialWeek.weekStart,
    weekEnd: initialWeek.weekEnd,
  });

  return (
    <DashboardLayout heroTitle="Data Import" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BrandPageTitle
            title="Master System Import"
            description="Paste from Raymond's master system — upsert by master ID"
          />
          <Link href="/data-import/history" className="text-sm font-medium text-brand-700 underline">
            Import history
          </Link>
        </div>

        <div className="space-y-2 text-sm text-gray-600">
          <p>
            Import order: <strong>Employees → Customers → Jobs → Assignments</strong>. Raymond&apos;s master
            system remains the source of truth.
          </p>
          <p>
            Paste from Excel or CSV <strong>with column headers</strong> (not space-separated). Employee Status is
            optional and defaults to Active; deactivate employees manually on the Employees page and re-import without
            Status to keep them Inactive.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                tab === t.id ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'employee' ? (
          <ImportWorkflow
            key="employee"
            helpText={HELP.employee}
            parsePaste={parseEmployeePaste}
            previewImport={(rows, dryRun) => api.importEmployeesBatch(rows, dryRun)}
            commitImport={(rows) => api.importEmployeesBatch(rows, false)}
          />
        ) : null}

        {tab === 'customer' ? (
          <ImportWorkflow
            key="customer"
            helpText={HELP.customer}
            parsePaste={parseCustomerPaste}
            previewImport={(rows, dryRun) => api.importCustomersBatch(rows, dryRun)}
            commitImport={(rows) => api.importCustomersBatch(rows, false)}
          />
        ) : null}

        {tab === 'job' ? (
          <ImportWorkflow
            key="job"
            helpText={HELP.job}
            parsePaste={parseJobPaste}
            previewImport={(rows, dryRun) => api.importJobSitesBatch(rows, dryRun)}
            commitImport={(rows) => api.importJobSitesBatch(rows, false)}
          />
        ) : null}

        {tab === 'assignment' ? (
          <div className="space-y-4">
            <WorkingWeekSelector value={workingWeek} onChange={setWorkingWeek} />
            <ImportWorkflow
              helpText={HELP.assignment}
              parsePaste={parseAssignmentPaste}
              supportsConflicts
              assignmentWeek={workingWeek}
              previewImport={(rows, dryRun, resolutions) =>
                api.importAssignmentsBatch(
                  rows,
                  dryRun,
                  resolutions ?? [],
                  workingWeek.weekStart,
                  workingWeek.weekEnd,
                )
              }
              commitImport={(rows, resolutions) =>
                api.importAssignmentsBatch(
                  rows,
                  false,
                  resolutions ?? [],
                  workingWeek.weekStart,
                  workingWeek.weekEnd,
                )
              }
            />
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
