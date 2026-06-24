import type { ImportRowResult } from '@mc-labor/shared';
import type { DataImportRun } from '@/lib/domain-types';

export type ImportRunOutcome = 'success' | 'partial' | 'failed' | 'dry-run';

export type RowIssueFilter = 'all' | 'issues' | 'error' | 'conflict';

export function importRowDetailMessage(r: ImportRowResult): string {
  if (r.status !== 'conflict') return r.message;
  const data = r.data as Record<string, string> | undefined;
  if (!data?.currentJob && !data?.newJob) return r.message;
  const week =
    data.weekStart && data.weekEnd ? ` (week ${data.weekStart} – ${data.weekEnd})` : '';
  return `${data.currentJob ?? 'Current job'} → ${data.newJob ?? 'New job'}${week}. ${r.message}`;
}

export function getImportRunOutcome(run: DataImportRun): ImportRunOutcome {
  if (run.dryRun) return 'dry-run';
  if (run.failedCount > 0 && run.createdCount === 0 && run.updatedCount === 0) return 'failed';
  if (run.failedCount > 0 || run.conflictCount > 0) return 'partial';
  return 'success';
}

export function filterImportResults(
  results: ImportRowResult[],
  filter: RowIssueFilter,
): ImportRowResult[] {
  if (filter === 'all') return results;
  if (filter === 'issues') {
    return results.filter((r) => r.status === 'error' || r.status === 'conflict');
  }
  return results.filter((r) => r.status === filter);
}

export function summarizeImportResults(results: ImportRowResult[]) {
  const issues = results.filter((r) => r.status === 'error' || r.status === 'conflict');
  const groups = new Map<string, number>();

  for (const row of issues) {
    const label = importRowDetailMessage(row).replace(/\s+/g, ' ').trim();
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }

  return {
    issueCount: issues.length,
    errorCount: results.filter((r) => r.status === 'error').length,
    conflictCount: results.filter((r) => r.status === 'conflict').length,
    topIssues: [...groups.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([message, count]) => ({ message, count })),
  };
}

export function formatImportTypeLabel(type: DataImportRun['importType']): string {
  const labels: Record<DataImportRun['importType'], string> = {
    EMPLOYEE: 'Employees',
    CUSTOMER: 'Customers',
    JOB: 'Jobs',
    ASSIGNMENT: 'Assignments',
  };
  return labels[type] ?? type;
}
