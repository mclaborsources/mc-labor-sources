'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AssignmentImportResolution, ImportBatchResult } from '@mc-labor/shared';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { PasteImportPanel } from './PasteImportPanel';
import { ImportPreviewTable } from './ImportPreviewTable';
import { summarizeParsedRows } from './import-parsers';

export interface WorkingWeekParams {
  weekStart: string;
  weekEnd: string;
}

interface ImportWorkflowProps<TRow extends Record<string, unknown>> {
  helpText: string;
  parsePaste: (text: string) => TRow[];
  previewImport: (rows: TRow[], dryRun: boolean, resolutions?: AssignmentImportResolution[]) => Promise<ImportBatchResult>;
  commitImport: (rows: TRow[], resolutions?: AssignmentImportResolution[]) => Promise<ImportBatchResult>;
  supportsConflicts?: boolean;
  assignmentWeek?: WorkingWeekParams;
}

function isMoveResolutionValid(resolution: AssignmentImportResolution | undefined): boolean {
  if (!resolution || resolution.action !== 'move') return true;
  return Boolean(resolution.oldEndDate?.trim() && resolution.newStartDate?.trim());
}

export function ImportWorkflow<TRow extends Record<string, unknown>>({
  helpText,
  parsePaste,
  previewImport,
  commitImport,
  supportsConflicts = false,
  assignmentWeek,
}: ImportWorkflowProps<TRow>) {
  const [rows, setRows] = useState<TRow[]>([]);
  const [preview, setPreview] = useState<ImportBatchResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportBatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolutions, setResolutions] = useState<AssignmentImportResolution[]>([]);

  const parsedSummary = useMemo(() => {
    const map: Record<number, string> = {};
    rows.forEach((row, i) => {
      map[i + 1] = summarizeParsedRows([row]);
    });
    return map;
  }, [rows]);

  const runPreview = useCallback(
    async (parsed: TRow[], currentResolutions: AssignmentImportResolution[]) => {
      setLoading(true);
      setError('');
      try {
        const result = await previewImport(parsed, true, currentResolutions);
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Preview failed');
        setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [previewImport],
  );

  const handleParse = useCallback(
    async (text: string) => {
      setError('');
      setCommitResult(null);
      const parsed = parsePaste(text);
      setRows(parsed);
      setResolutions([]);
      if (parsed.length === 0) {
        setPreview(null);
        setError('No data rows found. Paste at least one row.');
        return;
      }
      await runPreview(parsed, []);
    },
    [parsePaste, runPreview],
  );

  useEffect(() => {
    if (!supportsConflicts || !assignmentWeek || rows.length === 0 || commitResult) return;
    setResolutions([]);
    void runPreview(rows, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-preview when week changes only
  }, [assignmentWeek?.weekStart, assignmentWeek?.weekEnd]);

  const handleResolve = (row: number, resolution: AssignmentImportResolution) => {
    setResolutions((prev) => {
      const rest = prev.filter((r) => r.row !== row);
      return [...rest, resolution];
    });
  };

  const conflictRows = useMemo(() => {
    if (!preview || !supportsConflicts) return [] as number[];
    return preview.results.filter((r) => r.status === 'conflict').map((r) => r.row);
  }, [preview, supportsConflicts]);

  const unresolvedConflicts = useMemo(() => {
    return conflictRows.filter((row) => {
      const resolution = resolutions.find((r) => r.row === row);
      if (!resolution) return true;
      if (resolution.action === 'skip') return false;
      if (resolution.action === 'move') return !isMoveResolutionValid(resolution);
      return true;
    }).length;
  }, [conflictRows, resolutions]);

  const invalidMoveCount = useMemo(() => {
    return conflictRows.filter((row) => {
      const resolution = resolutions.find((r) => r.row === row);
      return resolution?.action === 'move' && !isMoveResolutionValid(resolution);
    }).length;
  }, [conflictRows, resolutions]);

  const handleCommit = async () => {
    if (rows.length === 0) return;
    if (unresolvedConflicts > 0) {
      setError('Resolve all assignment conflicts before importing.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await commitImport(rows, supportsConflicts ? resolutions : undefined);
      setCommitResult(result);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const displayResult = commitResult ?? preview;

  const warningCount = useMemo(() => {
    if (!displayResult) return 0;
    return displayResult.results.filter((r) => r.status === 'warning').length;
  }, [displayResult]);

  const conflictCount = useMemo(() => {
    if (displayResult?.conflicts != null) return displayResult.conflicts;
    if (!displayResult) return 0;
    return displayResult.results.filter((r) => r.status === 'conflict').length;
  }, [displayResult]);

  return (
    <div className="space-y-6">
      <PasteImportPanel helpText={helpText} onParse={handleParse} disabled={loading} />
      {loading ? <LoadingState message="Processing import..." /> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {displayResult ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            <span>Pasted: {displayResult.pasted}</span>
            <span>Created: {displayResult.created}</span>
            <span>Updated: {displayResult.updated}</span>
            {displayResult.skipped != null ? <span>Skipped: {displayResult.skipped}</span> : null}
            {warningCount > 0 ? <span>Warnings: {warningCount}</span> : null}
            {supportsConflicts ? <span>Conflicts: {conflictCount}</span> : null}
            <span>Failed: {displayResult.failed}</span>
          </div>
          <ImportPreviewTable
            results={displayResult.results}
            parsedSummary={parsedSummary}
            resolutions={supportsConflicts ? resolutions : undefined}
            onResolve={supportsConflicts ? handleResolve : undefined}
          />
          {!commitResult && preview ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={handleCommit} disabled={loading || unresolvedConflicts > 0}>
                Confirm Import
              </Button>
              {unresolvedConflicts > 0 ? (
                <span className="text-sm text-amber-700">
                  {unresolvedConflicts} conflict(s) need Skip or Move with both dates
                </span>
              ) : null}
              {invalidMoveCount > 0 ? (
                <span className="text-sm text-amber-700">
                  {invalidMoveCount} Move action(s) missing end or start date
                </span>
              ) : null}
            </div>
          ) : null}
          {commitResult?.runId ? (
            <p className="text-sm text-gray-600">
              Import logged.{' '}
              <Link href="/data-import/history" className="text-brand-700 underline">
                View history
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
