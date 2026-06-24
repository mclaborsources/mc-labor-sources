'use client';

import { useMemo, useState } from 'react';
import type { ImportRowResult } from '@mc-labor/shared';
import type { DataImportRun } from '@/lib/domain-types';
import { ImportAlert } from '@/components/import/ImportAlert';
import { ImportStatsGrid } from '@/components/import/ImportStatsGrid';
import { PortalFilterField } from '@/components/portal/PortalFilterField';
import { Select } from '@/components/ui/Select';
import { portalFieldClassName } from '@/components/portal';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, Th, Td } from '@/components/ui/Table';
import { formatWorkingWeekLabel } from '@/lib/working-week';
import {
  filterImportResults,
  formatImportTypeLabel,
  getImportRunOutcome,
  importRowDetailMessage,
  summarizeImportResults,
  type RowIssueFilter,
} from '@/lib/import-history-utils';
import { cn } from '@/lib/utils';

interface ImportHistoryDetailPanelProps {
  run: DataImportRun | null | undefined;
  results: ImportRowResult[];
  loading?: boolean;
  onClose: () => void;
}

const outcomeStyles: Record<
  ReturnType<typeof getImportRunOutcome>,
  { label: string; className: string }
> = {
  success: { label: 'Complete', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  partial: { label: 'Partial', className: 'bg-amber-50 text-amber-900 ring-amber-200' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-800 ring-red-200' },
  'dry-run': { label: 'Dry run', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export function ImportHistoryDetailPanel({
  run,
  results,
  loading,
  onClose,
}: ImportHistoryDetailPanelProps) {
  const [rowFilter, setRowFilter] = useState<RowIssueFilter>('issues');

  const summary = useMemo(() => summarizeImportResults(results), [results]);
  const filteredResults = useMemo(
    () => filterImportResults(results, rowFilter),
    [results, rowFilter],
  );

  if (!run && !loading) return null;

  const outcome = run ? getImportRunOutcome(run) : 'success';
  const outcomeStyle = outcomeStyles[outcome];

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100/80">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80 px-5 py-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">
              {run ? formatImportTypeLabel(run.importType) : 'Import run'}
            </h3>
            {run ? (
              <span
                className={cn(
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
                  outcomeStyle.className,
                )}
              >
                {outcomeStyle.label}
              </span>
            ) : null}
          </div>
          {run ? (
            <p className="text-sm text-slate-600">
              {new Date(run.importedAt).toLocaleString()}
              {run.importedByUser?.name ? ` · ${run.importedByUser.name}` : ''}
              {run.weekStartDate && run.weekEndDate
                ? ` · ${formatWorkingWeekLabel(run.weekStartDate, run.weekEndDate)}`
                : ''}
              {run.dryRun ? ' · Preview only' : ''}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Close
        </button>
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {loading ? <LoadingState message="Loading run details..." /> : null}

        {run && !loading ? (
          <>
            <ImportStatsGrid
              stats={{
                pasted: run.pastedCount,
                created: run.createdCount,
                updated: run.updatedCount,
                skipped: run.skippedCount,
                conflicts: run.conflictCount,
                failed: run.failedCount,
              }}
            />

            {run.importType === 'ASSIGNMENT' && (run.failedCount > 0 || run.conflictCount > 0) ? (
              <ImportAlert
                variant="warning"
                title="Assignment rows need attention"
                message={
                  run.failedCount > 0 && run.conflictCount > 0
                    ? `${run.conflictCount} row(s) had job conflicts; ${run.failedCount} did not import — usually because Skip or Move was not chosen before confirm.`
                    : run.conflictCount > 0
                      ? `${run.conflictCount} employee(s) were listed on two jobs in the same week.`
                      : `${run.failedCount} assignment row(s) failed to import.`
                }
                guidance="This is not caused by missing cell numbers. Open Issues only below to see each row. Re-import after resolving conflicts on the Data Import page, or use End all open assignments first."
              />
            ) : null}

            {summary.topIssues.length > 0 ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                <h4 className="text-sm font-semibold text-slate-800">Common issues in this run</h4>
                <ul className="mt-3 space-y-2">
                  {summary.topIssues.map((issue) => (
                    <li
                      key={issue.message}
                      className="flex gap-2 text-sm leading-snug text-slate-700"
                    >
                      <span className="shrink-0 font-semibold text-amber-800">{issue.count}×</span>
                      <span className="min-w-0">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {results.length > 0 ? (
              <div className="space-y-3">
                <PortalFilterField label="Row details">
                  <Select
                    value={rowFilter}
                    onChange={(e) => setRowFilter(e.target.value as RowIssueFilter)}
                    className={portalFieldClassName}
                  >
                    <option value="issues">
                      Issues only ({summary.issueCount})
                    </option>
                    <option value="error">Errors ({summary.errorCount})</option>
                    <option value="conflict">Conflicts ({summary.conflictCount})</option>
                    <option value="all">All rows ({results.length})</option>
                  </Select>
                </PortalFilterField>

                {filteredResults.length === 0 ? (
                  <p className="text-sm text-slate-500">No rows match this filter.</p>
                ) : (
                  <Table layoutFixed noHorizontalScroll compact>
                    <colgroup>
                      <col style={{ width: '4rem' }} />
                      <col style={{ width: '7rem' }} />
                      <col />
                      <col style={{ width: '6rem' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <Th>Row</Th>
                        <Th>Status</Th>
                        <Th>Message</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r) => (
                        <tr key={`${r.row}-${r.status}-${r.message}`}>
                          <Td className="font-mono text-xs">{r.row}</Td>
                          <Td>
                            <Badge status={r.status.toUpperCase()} className="normal-case" />
                          </Td>
                          <Td className="max-w-0 text-sm leading-snug">
                            <span title={importRowDetailMessage(r)}>
                              {importRowDetailMessage(r)}
                            </span>
                          </Td>
                          <Td className="text-xs text-slate-500">{r.action || '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No row-level details were saved for this run.</p>
            )}
          </>
        ) : null}
      </div>
    </article>
  );
}
