import * as XLSX from 'xlsx';
import {
  parseAssignmentRows,
  parseCustomerRows,
  parseEmployeeRows,
  parseJobRows,
  type RpcAssignmentRow,
  type RpcCustomerRow,
  type RpcEmployeeRow,
  type RpcJobRow,
} from './import-parsers';
import { normalizePasteCell } from './paste-utils';

export const WORKBOOK_SHEET_NAMES = {
  employees: 'Employees',
  customers: 'Customers',
  jobs: 'Jobs',
  assignments: 'Assignments',
} as const;

export type ParsedWorkbook = {
  fileName: string;
  employees: RpcEmployeeRow[];
  customers: RpcCustomerRow[];
  jobs: RpcJobRow[];
  assignments: RpcAssignmentRow[];
  sheetCounts: Record<string, number>;
  jobsMissingCustomerId: string[];
  jobsCustomerInferredFromAssignments: string[];
};

function normalizeSheetRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = '';
    } else {
      out[key] = normalizePasteCell(String(value));
    }
  }
  return out;
}

function findSheetName(sheetNames: string[], candidates: string[]): string | null {
  const normalized = sheetNames.map((name) => ({ name, key: name.trim().toLowerCase() }));
  for (const candidate of candidates) {
    const match = normalized.find((entry) => entry.key === candidate.toLowerCase());
    if (match) return match.name;
  }
  return null;
}

function sheetToRows(sheet: XLSX.WorkSheet): { headers: string[]; rows: Record<string, string>[] } {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  if (json.length === 0) return { headers: [], rows: [] };
  const rows = json.map(normalizeSheetRow);
  return { headers: Object.keys(rows[0]), rows };
}

function buildProjectCustomerMap(assignments: RpcAssignmentRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of assignments) {
    if (!row.master_job_id || !row.master_customer_id) continue;
    map.set(row.master_job_id, row.master_customer_id);
  }
  return map;
}

function enrichJobsWithCustomerIds(
  jobs: RpcJobRow[],
  projectCustomerMap: Map<string, string>,
): { jobs: RpcJobRow[]; inferred: string[]; stillMissing: string[] } {
  const inferred: string[] = [];
  const stillMissing: string[] = [];

  const enriched = jobs.map((job) => {
    if (job.master_customer_id) return job;
    const inferredCustomer = projectCustomerMap.get(job.master_job_id);
    if (inferredCustomer) {
      inferred.push(job.master_job_id);
      return { ...job, master_customer_id: inferredCustomer };
    }
    stillMissing.push(job.master_job_id);
    return job;
  });

  return { jobs: enriched, inferred, stillMissing };
}

export function parseWeeklyImportWorkbook(buffer: ArrayBuffer, fileName: string): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const employeesSheet = findSheetName(workbook.SheetNames, ['Employees', 'Employee']);
  const customersSheet = findSheetName(workbook.SheetNames, ['Customers', 'Customer']);
  const jobsSheet = findSheetName(workbook.SheetNames, ['Jobs', 'Job']);
  const assignmentsSheet = findSheetName(workbook.SheetNames, ['Assignments', 'Assignment']);

  const missingSheets = [
    !employeesSheet ? 'Employees' : null,
    !customersSheet ? 'Customers' : null,
    !jobsSheet ? 'Jobs' : null,
    !assignmentsSheet ? 'Assignments' : null,
  ].filter(Boolean);

  if (missingSheets.length > 0) {
    throw new Error(`Workbook is missing required sheet(s): ${missingSheets.join(', ')}`);
  }

  const employeeTable = sheetToRows(workbook.Sheets[employeesSheet!]);
  const customerTable = sheetToRows(workbook.Sheets[customersSheet!]);
  const jobTable = sheetToRows(workbook.Sheets[jobsSheet!]);
  const assignmentTable = sheetToRows(workbook.Sheets[assignmentsSheet!]);

  const employees = parseEmployeeRows(employeeTable.rows, employeeTable.headers);
  const customers = parseCustomerRows(customerTable.rows, customerTable.headers);
  const jobsRaw = parseJobRows(jobTable.rows, jobTable.headers);
  const assignments = parseAssignmentRows(assignmentTable.rows, assignmentTable.headers);

  const projectCustomerMap = buildProjectCustomerMap(assignments);
  const { jobs, inferred, stillMissing } = enrichJobsWithCustomerIds(jobsRaw, projectCustomerMap);

  return {
    fileName,
    employees,
    customers,
    jobs,
    assignments,
    sheetCounts: {
      Employees: employees.length,
      Customers: customers.length,
      Jobs: jobs.length,
      Assignments: assignments.length,
    },
    jobsMissingCustomerId: stillMissing,
    jobsCustomerInferredFromAssignments: inferred,
  };
}

export async function readWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  return parseWeeklyImportWorkbook(buffer, file.name);
}
