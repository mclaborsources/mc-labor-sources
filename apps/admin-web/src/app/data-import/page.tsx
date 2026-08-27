'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { Button } from '@/components/ui/Button';
import {
  WorkbookImportProvider,
  WorkbookImportUploadSection,
  WorkbookImportPreviewCard,
} from '@/components/import/WorkbookImportWorkflow';
import { getCurrentWorkingWeek } from '@/lib/working-week';
import { cn } from '@/lib/utils';

const cardClassName =
  'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80';

function StepLabel({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
        {step}
      </span>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
    </div>
  );
}

export default function DataImportPage() {
  const [workingWeek, setWorkingWeek] = useState(() => {
    const currentWeek = getCurrentWorkingWeek();
    return { weekStart: currentWeek.weekStart, weekEnd: currentWeek.weekEnd };
  });

  return (
    <DashboardLayout heroTitle="Data Import" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto w-full max-w-none space-y-3 pb-4">
        <BrandPageTitle
          title="Master System Import"
          compact
          action={
            <Link href="/data-import/history">
              <Button size="sm" variant="ghost" icon="clock" type="button">
                Import history
              </Button>
            </Link>
          }
        />

        <WorkbookImportProvider workingWeek={workingWeek} onWorkingWeekChange={setWorkingWeek}>
          <div className="space-y-3">
            <article className={cn(cardClassName, 'p-4')}>
              <StepLabel step={1} title="Upload workbook" />
              <WorkbookImportUploadSection compact />
            </article>
            <WorkbookImportPreviewCard />
          </div>
        </WorkbookImportProvider>
      </div>
    </DashboardLayout>
  );
}
