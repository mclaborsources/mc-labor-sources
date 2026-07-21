'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import type { AssignmentImportResolution, ImportBatchResult } from '@mc-labor/shared';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { ImportPreviewTable } from './ImportPreviewTable';
import { readWorkbookFile, type ParsedWorkbook } from './excel-workbook';
import {
  findAssignmentScheduleConflicts,
  summarizeBatchCounts,
  validateWorkbookCrossReferences,
  type CrossSheetValidationIssue,
} from './import-validation';
import { summarizeParsedRows } from './import-parsers';
import type { WorkingWeekParams } from './ImportWorkflow';
import { ImportAlert } from './ImportAlert';
import { ImportFileDropzone } from './ImportFileDropzone';
import { ImportSectionAccordion } from './ImportSectionAccordion';
import { ImportStatsGrid } from './ImportStatsGrid';
import { mapImportErrorMessage } from './import-error-messages';
import { api } from '@/lib/api-client';
import type { WorkbookPendingIds } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const END_OPEN_ASSIGNMENTS_CONFIRMATION = 'END-OPEN-ASSIGNMENTS';

interface WorkbookImportWorkflowProps {
  workingWeek: WorkingWeekParams;
}

type SectionKey = 'employees' | 'customers' | 'jobs' | 'assignments';

type SectionPreview = {
  key: SectionKey;
  label: string;
  result: ImportBatchResult;
  rows: Record<string, unknown>[];
};

type WorkbookImportContextValue = {
  workingWeek: WorkingWeekParams;
  workbook: ParsedWorkbook | null;
  fileName: string;
  validationIssues: CrossSheetValidationIssue[];
  canImport: boolean;
  sections: SectionPreview[];
  resolutions: AssignmentImportResolution[];
  loading: boolean;
  committing: boolean;
  error: string;
  commitComplete: boolean;
  endedAssignmentCount: number | null;
  totals: ReturnType<typeof summarizeBatchCounts>;
  unresolvedConflicts: number;
  handleFile: (file: File) => void;
  handleDiscard: () => void;
  handleKeepAssignment: (employeeId: string, assignmentIndex: number) => void;
  handleResolve: (row: number, resolution: AssignmentImportResolution) => void;
  handleCommit: () => void;
};

const WorkbookImportContext = createContext<WorkbookImportContextValue | null>(null);

function useWorkbookImportContext() {
  const ctx = useContext(WorkbookImportContext);
  if (!ctx) throw new Error('WorkbookImport components must be used within WorkbookImportProvider');
  return ctx;
}

function isMoveResolutionValid(resolution: AssignmentImportResolution | undefined): boolean {
  if (!resolution || resolution.action !== 'move') return true;
  return Boolean(resolution.oldEndDate?.trim() && resolution.newStartDate?.trim());
}

function buildParsedSummary(rows: Record<string, unknown>[]): Record<number, string> {
  const map: Record<number, string> = {};
  rows.forEach((row, i) => {
    map[i + 1] = summarizeParsedRows([row]);
  });
  return map;
}

function ValidationAlerts({ issues }: { issues: CrossSheetValidationIssue[] }) {
  const errors = issues.filter(
    (i) => i.severity === 'error' && i.field !== 'Schedule conflict',
  );
  const warnings = issues.filter((i) => i.severity === 'warning');
  if (errors.length === 0 && warnings.length === 0) return null;

  const errorBody = errors
    .slice(0, 50)
    .map((issue) => `${issue.sheet} row ${issue.row > 0 ? issue.row : '—'} · ${issue.field}: ${issue.message}`)
    .join('\n');

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <ImportAlert
          variant="error"
          title={`Cross-sheet validation errors (${errors.length})`}
          message={errors.length > 50 ? 'Showing first 50 errors.' : undefined}
          technicalDetail={errorBody}
        />
      ) : null}
      {warnings.length > 0 ? (
        <ImportAlert
          variant="warning"
          title={`Warnings (${warnings.length})`}
          message={warnings.map((issue) => issue.message).join('\n')}
        />
      ) : null}
    </div>
  );
}

function SheetCountBadges({ workbook }: { workbook: ParsedWorkbook }) {
  const sheets = [
    { label: 'Employees', count: workbook.sheetCounts.Employees },
    { label: 'Customers', count: workbook.sheetCounts.Customers },
    { label: 'Jobs', count: workbook.sheetCounts.Jobs },
    { label: 'Assignments', count: workbook.sheetCounts.Assignments },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {sheets.map((sheet) => (
        <span
          key={sheet.label}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {sheet.label}
          <span className="rounded-full bg-white px-1.5 py-0.5 text-slate-900">{sheet.count}</span>
        </span>
      ))}
    </div>
  );
}

function DuplicateAssignmentEditor({
  workbook,
  disabled,
  onKeep,
}: {
  workbook: ParsedWorkbook;
  disabled: boolean;
  onKeep: (employeeId: string, assignmentIndex: number) => void;
}) {
  const conflicts = findAssignmentScheduleConflicts(workbook);
  if (conflicts.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-red-200 bg-red-50/50">
      <header className="border-b border-red-200 bg-red-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-red-900">
          Duplicate employee assignments ({conflicts.length})
        </h3>
        <p className="mt-1 text-sm text-red-800">
          Choose the assignment to keep for each employee. The other assignments for that employee will be removed from this import.
        </p>
      </header>
      <div className="divide-y divide-red-100">
        {conflicts.map((conflict) => (
          <div key={conflict.employeeId} className="space-y-3 p-4">
            <div>
              <p className="font-semibold text-slate-900">{conflict.employeeName}</p>
              <p className="text-xs text-slate-500">Employee ID: {conflict.employeeId}</p>
            </div>
            <div className="grid gap-2">
              {conflict.rows.map((row) => (
                <div
                  key={`${row.assignmentIndex}-${row.jobId}`}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{row.jobLabel}</p>
                    <p className="text-sm text-slate-700">Company: {row.companyName}</p>
                    <p className="text-xs text-slate-500">Assignments sheet row {row.spreadsheetRow}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onKeep(conflict.employeeId, row.assignmentIndex)}
                  >
                    Keep this assignment
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WorkbookImportProvider({
  workingWeek,
  children,
}: WorkbookImportWorkflowProps & { children: ReactNode }) {
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [validationIssues, setValidationIssues] = useState<CrossSheetValidationIssue[]>([]);
  const [canImport, setCanImport] = useState(false);
  const [sections, setSections] = useState<SectionPreview[]>([]);
  const [resolutions, setResolutions] = useState<AssignmentImportResolution[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [commitComplete, setCommitComplete] = useState(false);
  const [endedAssignmentCount, setEndedAssignmentCount] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');

  const totals = useMemo(
    () =>
      summarizeBatchCounts(
        sections.map((s) => ({
          label: s.label,
          pasted: s.result.pasted,
          created: s.result.created,
          updated: s.result.updated,
          skipped: s.result.skipped,
          failed: s.result.failed,
          conflicts: s.result.conflicts,
        })),
      ),
    [sections],
  );

  const conflictRows = useMemo(() => {
    const assignmentSection = sections.find((s) => s.key === 'assignments');
    if (!assignmentSection) return [] as number[];
    return assignmentSection.result.results
      .filter((r) => r.status === 'conflict')
      .map((r) => r.row);
  }, [sections]);

  const unresolvedConflicts = useMemo(() => {
    return conflictRows.filter((row) => {
      const resolution = resolutions.find((r) => r.row === row);
      if (!resolution) return true;
      if (resolution.action === 'skip') return false;
      if (resolution.action === 'move') return !isMoveResolutionValid(resolution);
      return true;
    }).length;
  }, [conflictRows, resolutions]);

  const runPreview = useCallback(
    async (parsed: ParsedWorkbook, currentResolutions: AssignmentImportResolution[]) => {
      const portalIdsRaw = await api.getImportReferenceIds();
      const portalIds = {
        employeeIds: new Set(portalIdsRaw.employeeIds),
        customerIds: new Set(portalIdsRaw.customerIds),
        jobIds: new Set(portalIdsRaw.jobIds),
      };

      const validation = validateWorkbookCrossReferences(parsed, portalIds);
      setValidationIssues(validation.issues);
      setCanImport(validation.canImport);
      if (!validation.canImport) {
        setSections([]);
        return;
      }

      const pending: WorkbookPendingIds = {
        pendingEmployeeIds: parsed.employees.map((r) => r.master_employee_id).filter(Boolean),
        pendingCustomerIds: parsed.customers.map((r) => r.master_customer_id).filter(Boolean),
        pendingJobIds: parsed.jobs.map((r) => r.master_job_id).filter(Boolean),
      };

      const employees = await api.importEmployeesBatch(parsed.employees, true);
      const customers = await api.importCustomersBatch(parsed.customers, true);
      const jobs = await api.importJobSitesBatch(parsed.jobs, true, pending);
      const assignments = await api.importWeeklyAssignmentsBatch(
        parsed.assignments,
        true,
        currentResolutions,
        workingWeek.weekStart,
        workingWeek.weekEnd,
        pending,
      );

      setSections([
        { key: 'employees', label: 'Employees', result: employees, rows: parsed.employees },
        { key: 'customers', label: 'Customers', result: customers, rows: parsed.customers },
        { key: 'jobs', label: 'Jobs', result: jobs, rows: parsed.jobs },
        {
          key: 'assignments',
          label: 'Assignments',
          result: assignments,
          rows: parsed.assignments,
        },
      ]);
    },
    [workingWeek.weekStart, workingWeek.weekEnd],
  );

  const handleFile = async (file: File) => {
    setError('');
    setCommitComplete(false);
    setEndedAssignmentCount(null);
    setResolutions([]);
    setLoading(true);
    try {
      const parsed = await readWorkbookFile(file);
      setWorkbook(parsed);
      setFileName(file.name);
      await runPreview(parsed, []);
    } catch (err) {
      setWorkbook(null);
      setSections([]);
      setValidationIssues([]);
      setCanImport(false);
      setError(err instanceof Error ? err.message : 'Could not parse workbook');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    if (committing) return;
    setWorkbook(null);
    setFileName('');
    setValidationIssues([]);
    setCanImport(false);
    setSections([]);
    setResolutions([]);
    setError('');
    setCommitComplete(false);
    setEndedAssignmentCount(null);
  };

  const handleKeepAssignment = async (employeeId: string, assignmentIndex: number) => {
    if (!workbook || loading || committing) return;
    const assignments = workbook.assignments.filter((assignment, index) => (
      assignment.master_employee_id.trim() !== employeeId || index === assignmentIndex
    ));
    const nextWorkbook: ParsedWorkbook = {
      ...workbook,
      assignments,
      sheetCounts: {
        ...workbook.sheetCounts,
        Assignments: assignments.length,
      },
    };
    setWorkbook(nextWorkbook);
    setResolutions([]);
    setError('');
    setLoading(true);
    try {
      await runPreview(nextWorkbook, []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update import preview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workbook || commitComplete) return;
    setResolutions([]);
    void (async () => {
      setLoading(true);
      setError('');
      try {
        await runPreview(workbook, []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-preview when week changes
  }, [workingWeek.weekStart, workingWeek.weekEnd]);

  const handleResolve = (row: number, resolution: AssignmentImportResolution) => {
    setResolutions((prev) => {
      const rest = prev.filter((r) => r.row !== row);
      return [...rest, resolution];
    });
  };

  const handleCommit = async () => {
    if (!workbook || !canImport) return;
    setCommitting(true);
    setError('');
    try {
      await api.importEmployeesBatch(workbook.employees, false);
      await api.importCustomersBatch(workbook.customers, false);
      await api.importJobSitesBatch(workbook.jobs, false);
      const completed = await api.completeAllOpenAssignments(
        workingWeek.weekEnd,
        END_OPEN_ASSIGNMENTS_CONFIRMATION,
      );
      setEndedAssignmentCount(completed.count);
      await api.importWeeklyAssignmentsBatch(
        workbook.assignments,
        false,
        resolutions,
        workingWeek.weekStart,
        workingWeek.weekEnd,
      );
      setCommitComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setCommitting(false);
    }
  };

  const value: WorkbookImportContextValue = {
    workingWeek,
    workbook,
    fileName,
    validationIssues,
    canImport,
    sections,
    resolutions,
    loading,
    committing,
    error,
    commitComplete,
    endedAssignmentCount,
    totals,
    unresolvedConflicts,
    handleFile,
    handleDiscard,
    handleKeepAssignment,
    handleResolve,
    handleCommit,
  };

  return <WorkbookImportContext.Provider value={value}>{children}</WorkbookImportContext.Provider>;
}

export function WorkbookImportUploadSection() {
  const { fileName, workbook, loading, committing, error, sections, handleFile } = useWorkbookImportContext();
  const errorPresentation = error && sections.length === 0 ? mapImportErrorMessage(error) : null;

  return (
    <div className="space-y-4">
      <ImportFileDropzone
        fileName={fileName || null}
        disabled={loading || committing}
        onFile={(file) => void handleFile(file)}
      />

      {loading ? <LoadingState message="Parsing workbook and running preview..." /> : null}

      {errorPresentation ? (
        <ImportAlert
          variant="error"
          title={errorPresentation.title}
          message={errorPresentation.message}
          guidance={errorPresentation.guidance}
          technicalDetail={errorPresentation.technicalDetail}
        />
      ) : null}

      {workbook ? <SheetCountBadges workbook={workbook} /> : null}
    </div>
  );
}

export const workbookPreviewCardClassName =
  'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80';

export function WorkbookImportPreviewCard() {
  const {
    workbook,
    validationIssues,
    sections,
    resolutions,
    loading,
    committing,
    error,
    commitComplete,
    endedAssignmentCount,
    totals,
    canImport,
    unresolvedConflicts,
    handleDiscard,
    handleKeepAssignment,
    handleResolve,
    handleCommit,
  } = useWorkbookImportContext();

  const errorPresentation = error && sections.length > 0 ? mapImportErrorMessage(error) : null;

  const showPreview =
    workbook &&
    (validationIssues.length > 0 || sections.length > 0 || loading || commitComplete || errorPresentation);

  if (!showPreview) return null;

  const sectionSteps: Record<SectionKey, number> = {
    employees: 1,
    customers: 2,
    jobs: 3,
    assignments: 4,
  };

  return (
    <article className={cn(workbookPreviewCardClassName, 'flex flex-col')}>
      <div className="space-y-6 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Preview &amp; confirm</h2>
          <p className="mt-1 text-sm text-slate-600">
            Review each section before committing. Resolve assignment conflicts in the Assignments panel.
          </p>
        </div>

        <ValidationAlerts issues={validationIssues} />

        <DuplicateAssignmentEditor
          workbook={workbook}
          disabled={loading || committing}
          onKeep={handleKeepAssignment}
        />

        {sections.length > 0 ? (
          <>
            <ImportStatsGrid stats={totals} />

            <div className="space-y-3">
              {sections.map((section) => {
                const warningCount = section.result.results.filter((r) => r.status === 'warning').length;
                const conflictCount =
                  section.result.conflicts ??
                  section.result.results.filter((r) => r.status === 'conflict').length;
                const parsedSummary = buildParsedSummary(section.rows);

                return (
                  <ImportSectionAccordion
                    key={section.key}
                    step={sectionSteps[section.key]}
                    label={section.label}
                    defaultOpen={section.key === 'assignments' && totals.conflicts > 0}
                    stats={{
                      pasted: section.result.pasted,
                      created: section.result.created,
                      updated: section.result.updated,
                      skipped: section.result.skipped,
                      failed: section.result.failed,
                      warnings: warningCount,
                      conflicts: conflictCount,
                    }}
                  >
                    <ImportPreviewTable
                      results={section.result.results}
                      parsedSummary={parsedSummary}
                      resolutions={section.key === 'assignments' ? resolutions : undefined}
                      onResolve={section.key === 'assignments' ? handleResolve : undefined}
                    />
                  </ImportSectionAccordion>
                );
              })}
            </div>
          </>
        ) : null}

        {commitComplete ? (
          <ImportAlert
            variant="success"
            title="Workbook import complete"
            message={`Employees, customers, jobs, and assignments were saved in order. ${endedAssignmentCount ?? 0} previously open assignment${endedAssignmentCount === 1 ? '' : 's'} were completed automatically.`}
            guidance={
              <>
                View the audit log on{' '}
                <Link href="/data-import/history" className="font-medium underline">
                  Import history
                </Link>
                .
              </>
            }
          />
        ) : null}

        {errorPresentation ? (
          <ImportAlert
            variant="error"
            title={errorPresentation.title}
            message={errorPresentation.message}
            guidance={errorPresentation.guidance}
            technicalDetail={errorPresentation.technicalDetail}
          />
        ) : null}
      </div>

      {!commitComplete && workbook ? (
        <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            {sections.length > 0 ? (
              <Button
                type="button"
                onClick={() => void handleCommit()}
                disabled={!canImport || committing || loading}
                loading={committing}
              >
                Confirm Full Import
              </Button>
            ) : null}
            <Button
              type="button"
              variant="softDanger"
              onClick={handleDiscard}
              disabled={committing || loading}
            >
              Discard upload
            </Button>
            {!canImport ? (
              <p className="text-sm font-medium text-red-700">
                Import blocked. Discard this upload, correct the workbook, and upload it again.
              </p>
            ) : unresolvedConflicts > 0 ? (
              <p className="text-sm text-amber-700">
                {unresolvedConflicts} open-assignment conflict(s) will be resolved automatically by completing existing assignments before import.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Confirming automatically completes all existing open assignments before importing the new schedule.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** Convenience wrapper when upload + preview layout is not split by the parent */
export function WorkbookImportWorkflow({ workingWeek }: WorkbookImportWorkflowProps) {
  return (
    <WorkbookImportProvider workingWeek={workingWeek}>
      <WorkbookImportUploadSection />
      <WorkbookImportPreviewCard />
    </WorkbookImportProvider>
  );
}
