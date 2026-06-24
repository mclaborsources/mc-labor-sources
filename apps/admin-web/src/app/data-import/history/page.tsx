'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { ImportHistoryDetailPanel } from '@/components/import/ImportHistoryDetailPanel';
import { ImportHistoryRunTable } from '@/components/import/ImportHistoryRunTable';
import { PortalFilterPanel, PortalFilterField, portalFieldClassName } from '@/components/portal';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api-client';
import type { ImportRowResult } from '@mc-labor/shared';

export default function DataImportHistoryPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ['data-import-runs', typeFilter],
    queryFn: () => api.getDataImportRuns({ importType: typeFilter || undefined, limit: 100 }),
  });

  const { data: selectedRun, isLoading: detailLoading } = useQuery({
    queryKey: ['data-import-run', selectedId],
    queryFn: () => (selectedId ? api.getDataImportRun(selectedId) : Promise.resolve(null)),
    enabled: !!selectedId,
  });

  const filteredRuns = useMemo(() => {
    let list = runs ?? [];
    if (outcomeFilter === 'issues') {
      list = list.filter((r) => r.failedCount > 0 || r.conflictCount > 0);
    } else if (outcomeFilter === 'success') {
      list = list.filter((r) => r.failedCount === 0 && r.conflictCount === 0 && !r.dryRun);
    }
    return list;
  }, [runs, outcomeFilter]);

  const detailResults = useMemo(() => {
    if (!selectedRun?.summary) return [] as ImportRowResult[];
    const summary = selectedRun.summary as { results?: ImportRowResult[] };
    return summary.results ?? [];
  }, [selectedRun]);

  return (
    <DashboardLayout heroTitle="Import History" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BrandPageTitle
            title="Import History"
            description="Audit log of workbook and paste imports — open a run to see failed or conflicting rows"
          />
          <Link href="/data-import" className="text-sm font-medium text-brand-700 underline">
            Back to Data Import
          </Link>
        </div>

        <PortalFilterPanel title="Filter runs">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <PortalFilterField label="Import type">
              <Select
                id="import-type-filter"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setSelectedId(null);
                }}
                className={portalFieldClassName}
              >
                <option value="">All types</option>
                <option value="EMPLOYEE">Employees</option>
                <option value="CUSTOMER">Customers</option>
                <option value="JOB">Jobs</option>
                <option value="ASSIGNMENT">Assignments</option>
              </Select>
            </PortalFilterField>
            <PortalFilterField label="Outcome">
              <Select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className={portalFieldClassName}
              >
                <option value="">All runs</option>
                <option value="issues">With failures or conflicts</option>
                <option value="success">Clean runs only</option>
              </Select>
            </PortalFilterField>
          </div>
        </PortalFilterPanel>

        {isLoading ? <LoadingState /> : null}

        {!isLoading && (runs?.length ?? 0) === 0 ? (
          <EmptyState
            title="No imports yet"
            description="Completed imports appear here after you confirm a workbook or paste import."
          />
        ) : null}

        {!isLoading && filteredRuns.length === 0 && (runs?.length ?? 0) > 0 ? (
          <EmptyState
            title="No runs match your filters"
            description="Try a different import type or outcome filter."
          />
        ) : null}

        {filteredRuns.length > 0 ? (
          <ImportHistoryRunTable
            runs={filteredRuns}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : null}

        {selectedId ? (
          <ImportHistoryDetailPanel
            run={selectedRun}
            results={detailResults}
            loading={detailLoading}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
