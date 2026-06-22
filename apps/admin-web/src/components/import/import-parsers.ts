import { findColumnValue, parsePastedTable, type ParsedTable } from './paste-utils';

export type RpcEmployeeRow = {
  master_employee_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  position?: string;
  hourly_rate?: string;
  bill_rate?: string;
  status?: string;
};

export type RpcCustomerRow = {
  master_customer_id: string;
  company_name: string;
  customer_type?: string;
  salesman?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  contacts: Record<string, {
    first_name?: string;
    last_name?: string;
    title?: string;
    email?: string;
    cell?: string;
    office_phone?: string;
  }>;
};

export type RpcJobRow = {
  master_job_id: string;
  master_customer_id: string;
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  start_date?: string;
  status?: string;
  foremen: Record<string, {
    name?: string;
    email?: string;
    cell?: string;
    office_phone?: string;
  }>;
};

export type RpcAssignmentRow = {
  master_employee_id: string;
  master_customer_id: string;
  master_job_id: string;
  master_assignment_id?: string;
  assigned_date?: string;
  job_name?: string;
  first_name?: string;
  last_name?: string;
};

function slotField(
  row: Record<string, string>,
  headers: string[],
  slot: number,
  label: string,
  field: string,
): string {
  const patterns = [
    `${label} ${slot} ${field}`,
    `${label}${slot} ${field}`,
    `${label} ${slot} ${field.replace(' ', '')}`,
    `Contact ${slot} ${field}`,
    `Foreman ${slot} ${field}`,
  ];
  for (const header of headers) {
    const nh = header.trim().toLowerCase();
    if (patterns.some((p) => nh === p.toLowerCase() || nh.includes(`${slot}`) && nh.includes(field.toLowerCase()))) {
      return (row[header] ?? '').trim();
    }
  }
  return findColumnValue(row, patterns);
}

export function parseEmployeePaste(text: string): RpcEmployeeRow[] {
  const { rows } = parsePastedTable(text);
  return rows.map((row) => ({
    master_employee_id: findColumnValue(row, ['employee id', 'employeeid', 'emp id', 'master employee id']),
    first_name: findColumnValue(row, ['first name', 'firstname', 'fname']),
    last_name: findColumnValue(row, ['last name', 'lastname', 'lname']),
    email: findColumnValue(row, ['email', 'e mail']),
    phone: findColumnValue(row, ['cell', 'phone', 'mobile']),
    position: findColumnValue(row, ['trade', 'position', 'trade position', 'job title']),
    hourly_rate: findColumnValue(row, ['pay rate', 'hourly rate', 'payrate']),
    bill_rate: findColumnValue(row, ['bill rate', 'billrate']),
    status: findColumnValue(row, ['status']),
  }));
}

export function parseCustomerPaste(text: string): RpcCustomerRow[] {
  const { headers, rows } = parsePastedTable(text);
  return rows.map((row) => {
    const contacts: RpcCustomerRow['contacts'] = {};
    for (let slot = 1; slot <= 10; slot++) {
      const first = slotField(row, headers, slot, 'Contact', 'First Name');
      const last = slotField(row, headers, slot, 'Contact', 'Last Name');
      const title = slotField(row, headers, slot, 'Contact', 'Title');
      const email = slotField(row, headers, slot, 'Contact', 'Email');
      const cell = slotField(row, headers, slot, 'Contact', 'Cell');
      const office = slotField(row, headers, slot, 'Contact', 'Office Phone');
      if (!first && !last && !email && !cell) continue;
      contacts[String(slot - 1)] = {
        first_name: first || undefined,
        last_name: last || undefined,
        title: title || undefined,
        email: email || undefined,
        cell: cell || undefined,
        office_phone: office || undefined,
      };
    }
    return {
      master_customer_id: findColumnValue(row, ['customer id', 'customerid', 'cust id']),
      company_name: findColumnValue(row, ['name', 'company name', 'customer name']),
      customer_type: findColumnValue(row, ['customer type', 'type']),
      salesman: findColumnValue(row, ['salesman', 'sales man']),
      street: findColumnValue(row, ['street', 'address']),
      city: findColumnValue(row, ['city']),
      state: findColumnValue(row, ['state']),
      zip: findColumnValue(row, ['zip', 'zip code']),
      contacts,
    };
  });
}

export function parseJobPaste(text: string): RpcJobRow[] {
  const { headers, rows } = parsePastedTable(text);
  return rows.map((row) => {
    const foremen: RpcJobRow['foremen'] = {};
    for (let slot = 1; slot <= 20; slot++) {
      const name = slotField(row, headers, slot, 'Foreman', 'Name');
      const email = slotField(row, headers, slot, 'Foreman', 'Email');
      const cell = slotField(row, headers, slot, 'Foreman', 'Cell');
      const office = slotField(row, headers, slot, 'Foreman', 'Office Phone');
      if (!name && !email && !cell) continue;
      foremen[String(slot - 1)] = {
        name: name || undefined,
        email: email || undefined,
        cell: cell || undefined,
        office_phone: office || undefined,
      };
    }
    return {
      master_job_id: findColumnValue(row, ['job id', 'jobid']),
      master_customer_id: findColumnValue(row, ['customer id', 'customerid']),
      name: findColumnValue(row, ['job name', 'name', 'site name']),
      street: findColumnValue(row, ['street', 'address']),
      city: findColumnValue(row, ['city']),
      state: findColumnValue(row, ['state']),
      zip: findColumnValue(row, ['zip', 'zip code']),
      start_date: findColumnValue(row, ['start date', 'startdate']),
      status: findColumnValue(row, ['status']),
      foremen,
    };
  });
}

export function parseAssignmentPaste(text: string): RpcAssignmentRow[] {
  const { rows } = parsePastedTable(text);
  return rows.map((row) => ({
    master_employee_id: findColumnValue(row, ['employee id', 'employeeid', 'emp id']),
    master_customer_id: findColumnValue(row, ['customer id', 'customerid']),
    master_job_id: findColumnValue(row, ['job id', 'jobid']),
    master_assignment_id: findColumnValue(row, ['assignment id']) || undefined,
    assigned_date: findColumnValue(row, ['start date', 'assigned date', 'assignment date']) || undefined,
    job_name: findColumnValue(row, ['job name', 'site name']),
    first_name: findColumnValue(row, ['first name', 'firstname']),
    last_name: findColumnValue(row, ['last name', 'lastname']),
  }));
}

export function summarizeParsedRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'No rows detected';
  const first = rows[0];
  const keys = Object.keys(first).slice(0, 6);
  return keys.map((k) => `${k}: ${String(first[k] ?? '')}`).join(' · ');
}
