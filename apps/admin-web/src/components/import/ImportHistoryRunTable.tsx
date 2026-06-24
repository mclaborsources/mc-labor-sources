'use client';

import type { DataImportRun } from '@/lib/domain-types';
import { PortalRecordsPanel } from '@/components/portal';
import { Table, Th, Td } from '@/components/ui/Table';
import { formatWorkingWeekLabel } from '@/lib/working-week';
import {
  formatImportTypeLabel,
  getImportRunOutcome,
} from '@/lib/import-history-utils';
import { cn } from '@/lib/utils';

interface ImportHistoryRunTableProps {
  runs: DataImportRun[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function OutcomeBadge({ run }: { run: DataImportRun }) {
  const outcome = getImportRunOutcome(run);
  const styles = {
    success: 'bg-emerald-50 text-emerald-800',
    partial: 'bg-amber-50 text-amber-900',
    failed: 'bg-red-50 text-red-800',
    'dry-run': 'bg-slate-100 text-slate-600',
  };
  const labels = {
    success: 'OK',
    partial: 'Partial',
    failed: 'Failed',
    'dry-run': 'Preview',
  };
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
        styles[outcome],
      )}
    >
      {labels[outcome]}
    </span>
  );
}

function CountSummary({ run }: { run: DataImportRun }) {
  const parts: string[] = [];
  if (run.createdCount) parts.push(`+${run.createdCount} created`);
  if (run.updatedCount) parts.push(`${run.updatedCount} updated`);
  if (run.skippedCount) parts.push(`${run.skippedCount} skipped`);
  if (run.failedCount) parts.push(`${run.failedCount} failed`);
  return (
    <span className="text-xs leading-relaxed text-slate-600">
      {parts.length ? parts.join(' · ') : '—'}
    </span>
  );
}

export function ImportHistoryRunTable({ runs, selectedId, onSelect }: ImportHistoryRunTableProps) {
  return (
    <PortalRecordsPanel title="Import runs" count={runs.length} countLabel="runs">
      <Table layoutFixed noHorizontalScroll compact>
        <colgroup>
          <col style={{ width: '11rem' }} />
          <col style={{ width: '7rem' }} />
          <col style={{ width: '5rem' }} />
          <col style={{ width: '9rem' }} />
          <col style={{ width: '8rem' }} />
          <col />
          <col style={{ width: '4rem' }} />
        </colgroup>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Type</Th>
            <Th>Result</Th>
            <Th>Week</Th>
            <Th>Admin</Th>
            <Th>Summary</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const selected = run.id === selectedId;
            const hasIssues = run.failedCount > 0 || run.conflictCount > 0;
            return (
              <tr
                key={run.id}
                className={cn(
                  selected && 'bg-primary/[0.06]',
                  hasIssues && !selected && 'bg-amber-50/40',
                )}
              >
                <Td className="text-xs text-slate-700">{formatWhen(run.importedAt)}</Td>
                <Td className="text-sm font-medium text-slate-800">
                  {formatImportTypeLabel(run.importType)}
                </Td>
                <Td>
                  <OutcomeBadge run={run} />
                </Td>
                <Td className="max-w-0 truncate text-xs text-slate-600">
                  {run.weekStartDate && run.weekEndDate
                    ? formatWorkingWeekLabel(run.weekStartDate, run.weekEndDate)
                    : '—'}
                </Td>
                <Td className="max-w-0 truncate text-xs text-slate-600">
                  {run.importedByUser?.name ?? '—'}
                </Td>
                <Td className="max-w-0">
                  <CountSummary run={run} />
                  {run.importType === 'ASSIGNMENT' && run.conflictCount > 0 ? (
                    <span className="mt-0.5 block text-xs text-amber-800">
                      {run.conflictCount} conflict{run.conflictCount === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <button
                    type="button"
                    className={cn(
                      'text-sm font-medium',
                      selected ? 'text-primary' : 'text-brand-700 underline',
                    )}
                    onClick={() => onSelect(run.id)}
                  >
                    {selected ? 'Open' : 'View'}
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </PortalRecordsPanel>
  );
}
