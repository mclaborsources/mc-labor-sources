'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AssignmentImportResolution, ImportBatchResult } from '@mc-labor/shared';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { PasteImportPanel } from './PasteImportPanel';
import { ImportPreviewTable } from './ImportPreviewTable';
import { summarizeParsedRows } from './import-parsers';
import { ImportAlert } from './ImportAlert';
import { ImportStatsGrid } from './ImportStatsGrid';
import { mapImportErrorMessage } from './import-error-messages';
import { cn } from '@/lib/utils';

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

const previewCardClassName =
  'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80';

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

  const conflictCount = useMemo(() => {
    if (displayResult?.conflicts != null) return displayResult.conflicts;
    if (!displayResult) return 0;
    return displayResult.results.filter((r) => r.status === 'conflict').length;
  }, [displayResult]);

  const errorPresentation = error ? mapImportErrorMessage(error) : null;

  return (
    <div className="space-y-6">
      <PasteImportPanel helpText={helpText} onParse={handleParse} disabled={loading} />

      {loading ? <LoadingState message="Processing import..." /> : null}

      {errorPresentation && !displayResult ? (
        <ImportAlert
          variant="error"
          title={errorPresentation.title}
          message={errorPresentation.message}
          guidance={errorPresentation.guidance}
          technicalDetail={errorPresentation.technicalDetail}
        />
      ) : null}

      {displayResult ? (
        <article className={cn(previewCardClassName, 'flex flex-col')}>
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Preview</h3>
              <p className="mt-1 text-sm text-slate-600">Review row outcomes before confirming the import.</p>
            </div>

            <ImportStatsGrid
              stats={{
                pasted: displayResult.pasted,
                created: displayResult.created,
                updated: displayResult.updated,
                skipped: displayResult.skipped ?? 0,
                conflicts: conflictCount,
                failed: displayResult.failed,
              }}
              showConflicts={supportsConflicts}
            />

            <ImportPreviewTable
              results={displayResult.results}
              parsedSummary={parsedSummary}
              resolutions={supportsConflicts ? resolutions : undefined}
              onResolve={supportsConflicts ? handleResolve : undefined}
            />

            {commitResult?.runId ? (
              <ImportAlert
                variant="success"
                title="Import complete"
                message={
                  <>
                    Import logged.{' '}
                    <Link href="/data-import/history" className="font-medium underline">
                      View history
                    </Link>
                  </>
                }
              />
            ) : null}

            {errorPresentation && displayResult ? (
              <ImportAlert
                variant="error"
                title={errorPresentation.title}
                message={errorPresentation.message}
                guidance={errorPresentation.guidance}
                technicalDetail={errorPresentation.technicalDetail}
              />
            ) : null}
          </div>

          {!commitResult && preview ? (
            <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={handleCommit} disabled={loading || unresolvedConflicts > 0}>
                  Confirm Import
                </Button>
                {unresolvedConflicts > 0 ? (
                  <p className="text-sm text-amber-700">
                    {unresolvedConflicts} conflict(s) need Skip or Move with both dates
                  </p>
                ) : null}
                {invalidMoveCount > 0 ? (
                  <p className="text-sm text-amber-700">
                    {invalidMoveCount} Move action(s) missing end or start date
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
