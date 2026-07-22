'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { Button } from '@/components/ui/Button';
import { ImportWorkflow } from '@/components/import/ImportWorkflow';
import {
  WorkbookImportProvider,
  WorkbookImportUploadSection,
  WorkbookImportPreviewCard,
} from '@/components/import/WorkbookImportWorkflow';
import { WorkingWeekSelector } from '@/components/import/WorkingWeekSelector';
import { ImportHelpBanner } from '@/components/import/ImportHelpBanner';
import { TestDataResetPanel } from '@/components/import/TestDataResetPanel';
import { ImportModeToggle, type ImportMode } from '@/components/import/ImportModeToggle';
import {
  parseAssignmentPaste,
  parseCustomerPaste,
  parseEmployeePaste,
  parseJobPaste,
} from '@/components/import/import-parsers';
import { api } from '@/lib/api-client';
import { getWorkingWeekForFriday } from '@/lib/working-week';
import { cn } from '@/lib/utils';

type ImportTab = 'employee' | 'customer' | 'job' | 'assignment';

const PASTE_TABS: { id: ImportTab; label: string }[] = [
  { id: 'employee', label: 'Employees' },
  { id: 'customer', label: 'Customers' },
  { id: 'job', label: 'Jobs' },
  { id: 'assignment', label: 'Assignments' },
];

const HELP: Record<ImportTab, string> = {
  employee:
    'Paste employee rows from Excel/CSV with headers. Employee ID, names, contact, trade, and pay/bill rates required. Status is optional.',
  customer:
    'Paste one wide row per customer with Customer ID, Salesman, address fields, and contact columns.',
  job:
    'Paste one wide row per job with Project/Job ID, Customer ID (if available), address, start date, and foreman columns.',
  assignment:
    'Paste assignment rows with Employee ID, Customer ID, and Project/Job ID. Conflicts use the selected working week.',
};

const SAMPLE_WEEK_ENDING = '2026-06-19';

const enableTestDataReset = process.env.NEXT_PUBLIC_ENABLE_TEST_DATA_RESET === 'true';

const cardClassName =
  'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80';

function StepLabel({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {step}
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
    </div>
  );
}

export default function DataImportPage() {
  const [mode, setMode] = useState<ImportMode>('workbook');
  const [tab, setTab] = useState<ImportTab>('employee');
  const sampleWeek = useMemo(
    () => getWorkingWeekForFriday(new Date(`${SAMPLE_WEEK_ENDING}T12:00:00`)),
    [],
  );
  const [workingWeek, setWorkingWeek] = useState({
    weekStart: sampleWeek.weekStart,
    weekEnd: sampleWeek.weekEnd,
  });

  return (
    <DashboardLayout heroTitle="Data Import" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <BrandPageTitle
          title="Master System Import"
          titleAddon={
            <span className="inline-flex items-center rounded-full border border-amber-200/90 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Staging only
            </span>
          }
          description="Weekly workbook or single-sheet paste — upsert by master ID"
          action={
            <Link href="/data-import/history">
              <Button variant="ghost" icon="clock" type="button">
                Import history
              </Button>
            </Link>
          }
        />

        <ImportHelpBanner />

        <ImportModeToggle value={mode} onChange={setMode} />

        {mode === 'workbook' ? (
          <WorkbookImportProvider workingWeek={workingWeek} onWorkingWeekChange={setWorkingWeek}>
            <div className="space-y-6">
              <article className={cn(cardClassName, 'p-5 sm:p-6')}>
                <StepLabel step={1} title="Working week" />
                <WorkingWeekSelector
                  value={workingWeek}
                  onChange={setWorkingWeek}
                  defaultMode="custom"
                  defaultCustomFriday={SAMPLE_WEEK_ENDING}
                  embedded
                />
                <div className="mt-8">
                  <StepLabel step={2} title="Upload workbook" />
                  <WorkbookImportUploadSection />
                </div>
              </article>
              <WorkbookImportPreviewCard />
            </div>
          </WorkbookImportProvider>
        ) : (
          <article className={cardClassName}>
            <header className="border-b border-gray-100 bg-gradient-to-r from-white to-slate-50/80 px-5 py-4 sm:px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Entity</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {PASTE_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      tab === t.id
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="p-5 sm:p-6">
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
                <div className="space-y-6">
                  <WorkingWeekSelector
                    value={workingWeek}
                    onChange={setWorkingWeek}
                    defaultMode="custom"
                    defaultCustomFriday={SAMPLE_WEEK_ENDING}
                    embedded
                  />
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
          </article>
        )}

        {enableTestDataReset ? <TestDataResetPanel workingWeek={workingWeek} /> : null}

      </div>
    </DashboardLayout>
  );
}
