'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BrandPageTitle } from '@/components/brand';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { ImportPreviewTable } from '@/components/import/ImportPreviewTable';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Th, Td } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import { api, type DataImportRun } from '@/lib/api-client';
import type { ImportRowResult } from '@mc-labor/shared';

export default function DataImportHistoryPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ['data-import-runs', typeFilter],
    queryFn: () => api.getDataImportRuns({ importType: typeFilter || undefined }),
  });

  const { data: selectedRun, isLoading: detailLoading } = useQuery({
    queryKey: ['data-import-run', selectedId],
    queryFn: () => (selectedId ? api.getDataImportRun(selectedId) : Promise.resolve(null)),
    enabled: !!selectedId,
  });

  const detailResults = useMemo(() => {
    if (!selectedRun?.summary) return [] as ImportRowResult[];
    const summary = selectedRun.summary as { results?: ImportRowResult[] };
    return summary.results ?? [];
  }, [selectedRun]);

  return (
    <DashboardLayout heroTitle="Import History" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BrandPageTitle title="Import History" description="Audit log of master-system paste imports" />
          <Link href="/data-import" className="text-sm font-medium text-brand-700 underline">
            Back to Data Import
          </Link>
        </div>

        <div className="max-w-xs space-y-1">
          <label htmlFor="import-type-filter" className="text-sm font-medium text-gray-700">
            Filter by type
          </label>
          <Select
            id="import-type-filter"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setSelectedId(null);
            }}
          >
            <option value="">All types</option>
            <option value="EMPLOYEE">Employees</option>
            <option value="CUSTOMER">Customers</option>
            <option value="JOB">Jobs</option>
            <option value="ASSIGNMENT">Assignments</option>
          </Select>
        </div>

        {isLoading ? <LoadingState /> : null}

        {!isLoading && (runs?.length ?? 0) === 0 ? (
          <EmptyState title="No imports yet" description="Completed imports appear here after you confirm a paste import." />
        ) : null}

        {runs && runs.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Admin</Th>
                  <Th>Pasted</Th>
                  <Th>Created</Th>
                  <Th>Updated</Th>
                  <Th>Skipped</Th>
                  <Th>Failed</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run: DataImportRun) => (
                  <tr key={run.id}>
                    <Td>{new Date(run.importedAt).toLocaleString()}</Td>
                    <Td>{run.importType}</Td>
                    <Td>{run.importedByUser?.name ?? run.importedBy ?? '—'}</Td>
                    <Td>{run.pastedCount}</Td>
                    <Td>{run.createdCount}</Td>
                    <Td>{run.updatedCount}</Td>
                    <Td>{run.skippedCount}</Td>
                    <Td>{run.failedCount}</Td>
                    <Td>
                      <button
                        type="button"
                        className="text-sm text-brand-700 underline"
                        onClick={() => setSelectedId(run.id)}
                      >
                        View
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}

        {selectedId ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-lg font-semibold text-gray-900">Run details</h3>
            {detailLoading ? <LoadingState message="Loading run..." /> : null}
            {selectedRun ? (
              <>
                <p className="text-sm text-gray-600">
                  {selectedRun.importType} · {new Date(selectedRun.importedAt).toLocaleString()}
                  {selectedRun.dryRun ? ' · dry run' : ''}
                </p>
                {detailResults.length > 0 ? (
                  <ImportPreviewTable results={detailResults} />
                ) : (
                  <p className="text-sm text-gray-500">No row-level details recorded for this run.</p>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
