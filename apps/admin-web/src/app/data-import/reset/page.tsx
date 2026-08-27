'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { TestDataResetPanel } from '@/components/import/TestDataResetPanel';
import { DESTRUCTIVE_ACTION_PASS_CODE, PassCodeDialog } from '@/components/ui/PassCodeDialog';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { getCurrentWorkingWeek } from '@/lib/working-week';

export default function DataImportResetPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [passCode, setPassCode] = useState('');
  const [passCodeError, setPassCodeError] = useState('');
  const [workingWeek] = useState(() => {
    const week = getCurrentWorkingWeek();
    return { weekStart: week.weekStart, weekEnd: week.weekEnd };
  });

  const unlockPage = (event: FormEvent) => {
    event.preventDefault();
    if (passCode.trim() !== DESTRUCTIVE_ACTION_PASS_CODE) {
      setPassCodeError('Incorrect pass code.');
      return;
    }
    setPassCodeError('');
    setPassCode('');
    setUnlocked(true);
  };

  return (
    <DashboardLayout heroTitle="Delete Week" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto w-full max-w-none space-y-3 pb-4">
        <BrandPageTitle
          title="Delete Week"
          description="Delete imported records for a selected week"
          compact
        />
        {unlocked ? <TestDataResetPanel workingWeek={workingWeek} /> : null}
      </div>
      <PassCodeDialog
        open={!unlocked}
        value={passCode}
        error={passCodeError}
        pending={false}
        onChange={(value) => {
          setPassCode(value);
          if (passCodeError) setPassCodeError('');
        }}
        onCancel={() => router.replace('/assignments')}
        onSubmit={unlockPage}
      />
    </DashboardLayout>
  );
}
