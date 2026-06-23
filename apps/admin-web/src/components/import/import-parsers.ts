import {
  findColumnValue,
  normalizeImportDate,
  normalizeImportRate,
  normalizeImportStatus,
  normalizePasteCell,
  parsePastedTable,
} from './paste-utils';

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
  foreman_name?: string;
  foreman_email?: string;
  foreman_phone?: string;
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
  if (slot === 1 && label === 'Foreman') {
    patterns.push(`${label} ${field}`, `${label}${field.replace(' ', '')}`);
    if (field === 'Name') patterns.push('Foreman Name');
    if (field === 'Email') patterns.push('Foreman Email');
    if (field === 'Cell' || field === 'Office Phone') {
      patterns.push('Foreman Phone', 'Foreman Cell');
    }
  }
  for (const header of headers) {
    const nh = header.trim().toLowerCase();
    if (patterns.some((p) => nh === p.toLowerCase() || (nh.includes(`${slot}`) && nh.includes(field.toLowerCase())))) {
      return normalizePasteCell(row[header]);
    }
  }
  return findColumnValue(row, patterns);
}

function optionalField(value: string): string | undefined {
  const v = normalizePasteCell(value);
  return v || undefined;
}

function hasStatusColumn(headers: string[]): boolean {
  return headers.some((h) => {
    const normalized = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return normalized === 'status' || normalized.endsWith(' status');
  });
}

export function parseEmployeePaste(text: string): RpcEmployeeRow[] {
  const { headers, rows } = parsePastedTable(text);
  const includeStatus = hasStatusColumn(headers);
  return rows.map((row) => {
    const status = includeStatus ? normalizeImportStatus(findColumnValue(row, ['status'])) : undefined;
    return {
      master_employee_id: findColumnValue(row, ['employee id', 'employeeid', 'emp id', 'master employee id']),
      first_name: findColumnValue(row, ['first name', 'firstname', 'fname']),
      last_name: findColumnValue(row, ['last name', 'lastname', 'lname']),
      email: optionalField(findColumnValue(row, ['email', 'e mail'])),
      phone: optionalField(findColumnValue(row, ['cell', 'phone', 'mobile'])),
      position: optionalField(findColumnValue(row, ['trade', 'position', 'trade position', 'job title'])),
      hourly_rate: normalizeImportRate(findColumnValue(row, ['pay rate', 'hourly rate', 'payrate'])),
      bill_rate: normalizeImportRate(findColumnValue(row, ['bill rate', 'billrate'])),
      ...(status ? { status } : {}),
    };
  });
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

    const phone = findColumnValue(row, ['phone', 'contact phone', 'office phone']);
    const email = findColumnValue(row, ['email', 'contact email', 'office email']);
    if (Object.keys(contacts).length === 0 && (phone || email)) {
      contacts['0'] = {
        cell: phone || undefined,
        email: email || undefined,
      };
    }

    return {
      master_customer_id: findColumnValue(row, ['customer id', 'customerid', 'cust id']),
      company_name: findColumnValue(row, ['name', 'company name', 'customer name']),
      customer_type: optionalField(findColumnValue(row, ['customer type', 'type'])),
      salesman: optionalField(findColumnValue(row, ['salesman', 'sales man'])),
      street: optionalField(findColumnValue(row, ['street', 'address'])),
      city: optionalField(findColumnValue(row, ['city'])),
      state: optionalField(findColumnValue(row, ['state'])),
      zip: optionalField(findColumnValue(row, ['zip', 'zip code'])),
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
      if (!name && !email && !cell && !office) continue;
      foremen[String(slot - 1)] = {
        name: name || undefined,
        email: email || undefined,
        cell: cell || office || undefined,
        office_phone: office || undefined,
      };
    }

    const foremanName =
      findColumnValue(row, ['foreman name', 'foreman 1 name']) || foremen['0']?.name || '';
    const foremanEmail =
      findColumnValue(row, ['foreman email', 'foreman 1 email']) || foremen['0']?.email || '';
    const foremanPhone =
      findColumnValue(row, ['foreman phone', 'foreman 1 phone', 'foreman cell']) ||
      foremen['0']?.cell ||
      foremen['0']?.office_phone ||
      '';

    if (foremanName && !foremen['0']) {
      foremen['0'] = {
        name: foremanName,
        email: foremanEmail || undefined,
        cell: foremanPhone || undefined,
      };
    }

    const status = normalizeImportStatus(findColumnValue(row, ['status']));

    return {
      master_job_id: findColumnValue(row, ['job id', 'jobid']),
      master_customer_id: findColumnValue(row, ['customer id', 'customerid']),
      name: findColumnValue(row, ['job name', 'name', 'site name']),
      street: optionalField(findColumnValue(row, ['street', 'address', 'job street'])),
      city: optionalField(findColumnValue(row, ['city', 'job city'])),
      state: optionalField(findColumnValue(row, ['state', 'job state'])),
      zip: optionalField(findColumnValue(row, ['zip', 'zip code'])),
      start_date: normalizeImportDate(findColumnValue(row, ['start date', 'startdate'])),
      ...(status ? { status } : {}),
      foreman_name: optionalField(foremanName),
      foreman_email: optionalField(foremanEmail),
      foreman_phone: optionalField(foremanPhone),
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
    master_assignment_id:
      optionalField(findColumnValue(row, ['assignment id', 'tracking id', 'trackingid'])),
    assigned_date:
      normalizeImportDate(
        findColumnValue(row, [
          'start date',
          'assigned date',
          'assignment date',
          'week ending date',
        ]),
      ),
    job_name: optionalField(findColumnValue(row, ['job name', 'site name'])),
    first_name: optionalField(findColumnValue(row, ['first name', 'firstname'])),
    last_name: optionalField(findColumnValue(row, ['last name', 'lastname'])),
  }));
}

export function summarizeParsedRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'No rows detected';
  const first = rows[0];
  const keys = Object.keys(first).slice(0, 6);
  return keys.map((k) => `${k}: ${String(first[k] ?? '')}`).join(' · ');
}
