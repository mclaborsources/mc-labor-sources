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

export function validateWorkbookCrossReferences(
  workbook: ParsedWorkbook,
  portalIds: ImportReferenceIds,
): CrossSheetValidationResult {
  const issues: CrossSheetValidationIssue[] = [];

  const workbookEmployeeIds = idSet(workbook.employees.map((r) => r.master_employee_id));
  const workbookCustomerIds = idSet(workbook.customers.map((r) => r.master_customer_id));
  const workbookJobIds = idSet(workbook.jobs.map((r) => r.master_job_id));

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
