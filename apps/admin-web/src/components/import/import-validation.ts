import type { ParsedWorkbook } from './excel-workbook';

export type ImportReferenceIds = {
  employeeIds: Set<string>;
  customerIds: Set<string>;
  jobIds: Set<string>;
};

export type CrossSheetValidationIssue = {
  sheet: 'Employees' | 'Customers' | 'Jobs' | 'Assignments';
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
};

export type CrossSheetValidationResult = {
  issues: CrossSheetValidationIssue[];
  canImport: boolean;
};

function idSet(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim()).filter(Boolean));
}

function hasId(set: Set<string>, portal: Set<string>, id: string): boolean {
  const normalized = id.trim();
  return Boolean(normalized) && (set.has(normalized) || portal.has(normalized));
}

function normalizedId(value: string | undefined): string {
  return value?.trim() ?? '';
}

function assignmentEmployeeName(workbook: ParsedWorkbook, employeeId: string): string {
  const assignment = workbook.assignments.find(
    (row) => normalizedId(row.master_employee_id) === employeeId && (row.first_name || row.last_name),
  );
  const employee = workbook.employees.find(
    (row) => normalizedId(row.master_employee_id) === employeeId,
  );
  const firstName = assignment?.first_name || employee?.first_name;
  const lastName = assignment?.last_name || employee?.last_name;
  return [firstName, lastName].filter(Boolean).join(' ').trim() || `Employee ${employeeId}`;
}

function assignmentJobLabel(workbook: ParsedWorkbook, jobId: string): string {
  const assignment = workbook.assignments.find(
    (row) => normalizedId(row.master_job_id) === jobId && row.job_name,
  );
  const job = workbook.jobs.find((row) => normalizedId(row.master_job_id) === jobId);
  const name = assignment?.job_name || job?.name;
  return name ? `${name} (${jobId})` : `Job ${jobId}`;
}

export type AssignmentScheduleConflict = {
  employeeId: string;
  employeeName: string;
  rows: Array<{
    assignmentIndex: number;
    spreadsheetRow: number;
    jobId: string;
    jobLabel: string;
  }>;
};

export function findAssignmentScheduleConflicts(
  workbook: ParsedWorkbook,
): AssignmentScheduleConflict[] {
  const jobsByEmployee = new Map<string, Set<string>>();

  for (const row of workbook.assignments) {
    const employeeId = normalizedId(row.master_employee_id);
    const jobId = normalizedId(row.master_job_id);
    if (!employeeId || !jobId) continue;
    const jobs = jobsByEmployee.get(employeeId) ?? new Set<string>();
    jobs.add(jobId);
    jobsByEmployee.set(employeeId, jobs);
  }

  const conflicts: AssignmentScheduleConflict[] = [];
  for (const [employeeId, jobs] of jobsByEmployee) {
    if (jobs.size < 2) continue;
    const employeeName = assignmentEmployeeName(workbook, employeeId);
    conflicts.push({
      employeeId,
      employeeName,
      rows: workbook.assignments.flatMap((row, index) => {
        if (normalizedId(row.master_employee_id) !== employeeId) return [];
        const jobId = normalizedId(row.master_job_id);
        return [{
          assignmentIndex: index,
          spreadsheetRow: index + 2,
          jobId,
          jobLabel: assignmentJobLabel(workbook, jobId),
        }];
      }),
    });
  }
  return conflicts;
}

function addAssignmentScheduleConflicts(
  workbook: ParsedWorkbook,
  issues: CrossSheetValidationIssue[],
): void {
  for (const conflict of findAssignmentScheduleConflicts(workbook)) {
    const conflictingJobs = [...new Set(conflict.rows.map((row) => row.jobLabel))];
    for (const row of conflict.rows) {
      issues.push({
        sheet: 'Assignments',
        row: row.spreadsheetRow,
        field: 'Schedule conflict',
        message: `${conflict.employeeName} is assigned to multiple jobs: ${conflictingJobs.join(' and ')}. Remove the conflicting assignment before importing.`,
        severity: 'error',
      });
    }
  }
}

export function validateWorkbookCrossReferences(
  workbook: ParsedWorkbook,
  portalIds: ImportReferenceIds,
): CrossSheetValidationResult {
  const issues: CrossSheetValidationIssue[] = [];

  const workbookEmployeeIds = idSet(workbook.employees.map((r) => r.master_employee_id));
  const workbookCustomerIds = idSet(workbook.customers.map((r) => r.master_customer_id));
  const workbookJobIds = idSet(workbook.jobs.map((r) => r.master_job_id));

  addAssignmentScheduleConflicts(workbook, issues);

  workbook.assignments.forEach((row, index) => {
    const rowNum = index + 2;

    if (!row.master_employee_id) {
      issues.push({
        sheet: 'Assignments',
        row: rowNum,
        field: 'EmployeeID',
        message: 'EmployeeID is required',
        severity: 'error',
      });
    } else if (!hasId(workbookEmployeeIds, portalIds.employeeIds, row.master_employee_id)) {
      issues.push({
        sheet: 'Assignments',
        row: rowNum,
        field: 'EmployeeID',
        message: `EmployeeID ${row.master_employee_id} not found in Employees sheet or portal`,
        severity: 'error',
      });
    }

    if (!row.master_customer_id) {
      issues.push({
        sheet: 'Assignments',
        row: rowNum,
        field: 'CustomerID',
        message: 'CustomerID is required',
        severity: 'error',
      });
    } else if (!hasId(workbookCustomerIds, portalIds.customerIds, row.master_customer_id)) {
      issues.push({
        sheet: 'Assignments',
        row: rowNum,
        field: 'CustomerID',
        message: `CustomerID ${row.master_customer_id} not found in Customers sheet or portal`,
        severity: 'error',
      });
    }

    if (!row.master_job_id) {
      issues.push({
        sheet: 'Assignments',
        row: rowNum,
        field: 'ProjectID',
        message: 'ProjectID is required',
        severity: 'error',
      });
    } else if (!hasId(workbookJobIds, portalIds.jobIds, row.master_job_id)) {
      issues.push({
        sheet: 'Assignments',
        row: rowNum,
        field: 'ProjectID',
        message: `ProjectID ${row.master_job_id} not found in Jobs sheet or portal`,
        severity: 'error',
      });
    }
  });

  workbook.jobs.forEach((row, index) => {
    const rowNum = index + 2;
    if (!row.master_job_id) {
      issues.push({
        sheet: 'Jobs',
        row: rowNum,
        field: 'ProjectID',
        message: 'ProjectID is required',
        severity: 'error',
      });
    }
    if (!row.master_customer_id) {
      issues.push({
        sheet: 'Jobs',
        row: rowNum,
        field: 'CustomerID',
        message:
          'CustomerID is missing and could not be inferred from Assignments or portal data. Add CustomerID to the Jobs sheet or ensure Assignments link this ProjectID.',
        severity: 'error',
      });
    } else if (
      !workbookCustomerIds.has(row.master_customer_id.trim()) &&
      !portalIds.customerIds.has(row.master_customer_id.trim())
    ) {
      issues.push({
        sheet: 'Jobs',
        row: rowNum,
        field: 'CustomerID',
        message: `CustomerID ${row.master_customer_id} not found in Customers sheet or portal`,
        severity: 'error',
      });
    }
  });

  if (workbook.jobsCustomerInferredFromAssignments.length > 0) {
    issues.push({
      sheet: 'Jobs',
      row: 0,
      field: 'CustomerID',
      message: `${workbook.jobsCustomerInferredFromAssignments.length} job(s) had CustomerID inferred from Assignments (Jobs sheet has no CustomerID column).`,
      severity: 'warning',
    });
  }

  const canImport = !issues.some((issue) => issue.severity === 'error');
  return { issues, canImport };
}

export function summarizeBatchCounts(
  sections: Array<{ label: string; pasted: number; created: number; updated: number; skipped?: number; failed: number; conflicts?: number }>,
) {
  return sections.reduce(
    (acc, section) => ({
      pasted: acc.pasted + section.pasted,
      created: acc.created + section.created,
      updated: acc.updated + section.updated,
      skipped: acc.skipped + (section.skipped ?? 0),
      failed: acc.failed + section.failed,
      conflicts: acc.conflicts + (section.conflicts ?? 0),
    }),
    { pasted: 0, created: 0, updated: 0, skipped: 0, failed: 0, conflicts: 0 },
  );
}
