import { createClient } from './client';
import type {
  AuthUser,
  Employee,
  Customer,
  CustomerDetail,
  JobSite,
  Assignment,
  AttendanceLog,
  Timesheet,
  TimesheetEntry,
  JobOrder,
  Document,
  SafetyBulletin,
  Notification,
  DashboardStats,
  CustomerDashboard,
  CustomerJobSite,
  CompanySettings,
  SupervisorUser,
  SupervisorDashboard,
  SupervisorHoursReportRow,
  AdminHoursReportRow,
  DataImportRun,
} from '../domain-types';
import type {
  AssignmentImportResolution,
  BulkCustomerRow,
  BulkEmployeeRow,
  BulkImportResult,
  CreateCustomerUserInput,
  CreateWorkerUserInput,
  ImportBatchResult,
} from '@mc-labor/shared';
import { createUserSchema } from '@mc-labor/shared';
import { uploadDataUrl, uploadFile } from './storage';

export type WorkbookPendingIds = {
  pendingEmployeeIds?: string[];
  pendingCustomerIds?: string[];
  pendingJobIds?: string[];
};

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

function sb() {
  return createClient();
}

function throwIf(error: { message: string } | null) {
  if (error) throw new DataError(error.message);
}

async function createAppUser(body: Record<string, unknown>): Promise<unknown> {
  const validated = createUserSchema.parse(body);
  const { data: session } = await sb().auth.getSession();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-app-user`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session?.access_token}`,
      },
      body: JSON.stringify(validated),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new DataError(json.error || 'Failed to create user');
  return json;
}

async function invokeEdgeFunction(name: string, body: Record<string, unknown>): Promise<void> {
  try {
    const { data: session } = await sb().auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // fire-and-forget — in-app notifications remain primary
  }
}

async function sendTransactionalEmail(payload: {
  template: 'JOB_ORDER' | 'SAFETY' | 'TIMESHEET_SIGNED' | 'TIMESHEET_SENT';
  recipientEmail: string;
  subject: string;
  context?: Record<string, string>;
  relatedId?: string;
}): Promise<void> {
  if (!payload.recipientEmail) return;
  await invokeEdgeFunction('send-transactional-email', payload);
}

async function sendPushNotification(payload: {
  userId?: string;
  employeeId?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  await invokeEdgeFunction('send-push-notification', payload);
}

// --- mappers: snake_case DB -> camelCase UI ---

function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    id: row.id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    position: (row.position as string) ?? null,
    hourlyRate: (row.hourly_rate as string | number | null) ?? null,
    billRate: (row.bill_rate as string | number | null) ?? null,
    masterEmployeeId: (row.master_employee_id as string) ?? null,
    status: row.status as string,
  };
}

function mapCustomer(row: Record<string, unknown>): Customer {
  const jobSites = row.job_sites as { count: number }[] | undefined;
  const users = row.users as { count: number }[] | undefined;
  return {
    id: row.id as string,
    companyName: row.company_name as string,
    masterCustomerId: (row.master_customer_id as string) ?? null,
    customerType: (row.customer_type as string) ?? null,
    street: (row.street as string) ?? null,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    zip: (row.zip as string) ?? null,
    contactName: (row.contact_name as string) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    contactPhone: (row.contact_phone as string) ?? null,
    officeEmail: (row.office_email as string) ?? null,
    address: (row.address as string) ?? null,
    status: row.status as string,
    _count: {
      jobSites: jobSites?.[0]?.count ?? 0,
      users: users?.[0]?.count ?? 0,
    },
  };
}

function mapJobSite(row: Record<string, unknown>): JobSite {
  const customer = row.customer as Record<string, unknown> | null;
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    masterJobId: (row.master_job_id as string) ?? null,
    startDate: (row.start_date as string) ?? null,
    name: row.name as string,
    address: row.address as string,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    zipCode: (row.zip_code as string) ?? null,
    foremanName: (row.foreman_name as string) ?? null,
    foremanPhone: (row.foreman_phone as string) ?? null,
    foremanEmail: (row.foreman_email as string) ?? null,
    status: row.status as string,
    customer: customer
      ? { id: customer.id as string, companyName: customer.company_name as string }
      : undefined,
  };
}

function mapAssignment(row: Record<string, unknown>): Assignment {
  const employee = row.employee as Record<string, unknown> | null;
  const customer = row.customer as Record<string, unknown> | null;
  const jobSite = row.job_site as Record<string, unknown> | null;
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    customerId: row.customer_id as string,
    jobSiteId: row.job_site_id as string,
    masterAssignmentId: (row.master_assignment_id as string) ?? null,
    assignedDate: row.assigned_date as string,
    endDate: (row.end_date as string) ?? null,
    startTime: (row.start_time as string) ?? null,
    endTime: (row.end_time as string) ?? null,
    status: row.status as string,
    notes: (row.notes as string) ?? null,
    employee: employee ? mapEmployee(employee) : undefined,
    customer: customer
      ? { id: customer.id as string, companyName: customer.company_name as string }
      : undefined,
    jobSite: jobSite
      ? {
          id: jobSite.id as string,
          name: jobSite.name as string,
          address: jobSite.address as string | undefined,
        }
      : undefined,
  };
}

function mapAttendance(row: Record<string, unknown>): AttendanceLog {
  const employee = row.employee as Record<string, unknown> | null;
  const customer = row.customer as Record<string, unknown> | null;
  const jobSite = row.job_site as Record<string, unknown> | null;
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    customerId: row.customer_id as string,
    jobSiteId: row.job_site_id as string,
    clockInTime: row.clock_in_time as string,
    clockOutTime: (row.clock_out_time as string) ?? null,
    clockInLatitude: (row.clock_in_latitude as string | number | null) ?? null,
    clockInLongitude: (row.clock_in_longitude as string | number | null) ?? null,
    clockOutLatitude: (row.clock_out_latitude as string | number | null) ?? null,
    clockOutLongitude: (row.clock_out_longitude as string | number | null) ?? null,
    clockInLocationLabel: (row.clock_in_location_label as string | null) ?? null,
    clockOutLocationLabel: (row.clock_out_location_label as string | null) ?? null,
    totalHours: (row.total_hours as string | number | null) ?? null,
    status: row.status as string,
    employee: employee
      ? {
          id: employee.id as string,
          firstName: employee.first_name as string,
          lastName: employee.last_name as string,
        }
      : undefined,
    customer: customer
      ? { id: customer.id as string, companyName: customer.company_name as string }
      : undefined,
    jobSite: jobSite
      ? { id: jobSite.id as string, name: jobSite.name as string }
      : undefined,
  };
}

function mapTimesheet(row: Record<string, unknown>): Timesheet {
  const employee = row.employee as Record<string, unknown> | null;
  const customer = row.customer as Record<string, unknown> | null;
  const jobSite = row.job_site as Record<string, unknown> | null;
  const sig = row.signature as Record<string, unknown> | null;
  const entries = row.entries as Record<string, unknown>[] | undefined;
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    customerId: row.customer_id as string,
    jobSiteId: row.job_site_id as string,
    assignmentId: (row.assignment_id as string) ?? null,
    workDate: (row.work_date as string) ?? null,
    weekStartDate: (row.week_start_date as string) ?? null,
    weekEndDate: (row.week_end_date as string) ?? null,
    totalHours: row.total_hours as string | number,
    notes: (row.notes as string) ?? null,
    status: row.status as string,
    createdAt: (row.created_at as string) ?? undefined,
    employee: employee
      ? {
          id: employee.id as string,
          firstName: employee.first_name as string,
          lastName: employee.last_name as string,
        }
      : undefined,
    customer: customer
      ? { id: customer.id as string, companyName: customer.company_name as string }
      : undefined,
    jobSite: jobSite
      ? { id: jobSite.id as string, name: jobSite.name as string }
      : undefined,
    entries: entries?.map((e) => mapTimesheetEntry(e)),
    signature: sig
      ? {
          id: sig.id as string | undefined,
          foremanName: sig.foreman_name as string,
          foremanEmail: (sig.foreman_email as string) ?? null,
          signatureImageUrl: sig.signature_image_url as string,
          signedAt: (sig.signed_at as string) ?? undefined,
          sentToCustomerOffice: sig.sent_to_customer_office as boolean,
          sentToMcLaborOffice: sig.sent_to_mc_labor_office as boolean,
        }
      : undefined,
  };
}

function mapTimesheetEntry(row: Record<string, unknown>): TimesheetEntry {
  return {
    id: row.id as string,
    timesheetId: row.timesheet_id as string,
    workDate: row.work_date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    breakMinutes: row.break_minutes as number,
    hours: row.hours as string | number,
    notes: (row.notes as string) ?? null,
    attendanceLogId: (row.attendance_log_id as string) ?? null,
  };
}

function mapJobOrder(row: Record<string, unknown>): JobOrder {
  const employee = row.employee as Record<string, unknown> | null;
  const customer = row.customer as Record<string, unknown> | null;
  const jobSite = row.job_site as Record<string, unknown> | null;
  return {
    id: row.id as string,
    orderNumber: row.order_number as string,
    customerId: row.customer_id as string,
    jobSiteId: row.job_site_id as string,
    employeeId: (row.employee_id as string) ?? null,
    title: row.title as string,
    description: (row.description as string) ?? null,
    startDate: row.start_date as string,
    startTime: (row.start_time as string) ?? null,
    requiredPosition: (row.required_position as string) ?? null,
    instructions: (row.instructions as string) ?? null,
    safetyNotes: (row.safety_notes as string) ?? null,
    status: row.status as string,
    sentAt: (row.sent_at as string) ?? null,
    acknowledgedAt: (row.acknowledged_at as string) ?? null,
    createdById: row.created_by_id as string,
    createdAt: (row.created_at as string) ?? undefined,
    employee: employee
      ? {
          id: employee.id as string,
          firstName: employee.first_name as string,
          lastName: employee.last_name as string,
        }
      : undefined,
    customer: customer
      ? { id: customer.id as string, companyName: customer.company_name as string }
      : undefined,
    jobSite: jobSite ? { id: jobSite.id as string, name: jobSite.name as string } : undefined,
  };
}

function mapDocument(row: Record<string, unknown>): Document {
  const uploadedBy = row.uploaded_by as Record<string, unknown> | null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    fileUrl: row.file_url as string,
    category: row.category as string,
    uploadedById: row.uploaded_by_id as string,
    createdAt: (row.created_at as string) ?? undefined,
    uploadedBy: uploadedBy
      ? { id: uploadedBy.id as string, name: uploadedBy.name as string }
      : undefined,
  };
}

function mapSafetyBulletin(row: Record<string, unknown>): SafetyBulletin {
  const jobSite = row.job_site as Record<string, unknown> | null;
  const recipients = row.recipients as Record<string, unknown>[] | null;
  const recipientEmployees = (recipients ?? [])
    .map((r) => {
      const emp = r.employee as Record<string, unknown> | null;
      if (!emp) return null;
      return {
        id: emp.id as string,
        firstName: emp.first_name as string,
        lastName: emp.last_name as string,
      };
    })
    .filter((e): e is { id: string; firstName: string; lastName: string } => e !== null);
  return {
    id: row.id as string,
    title: row.title as string,
    message: row.message as string,
    fileUrl: (row.file_url as string) ?? null,
    audience: row.audience as string,
    jobSiteId: (row.job_site_id as string) ?? null,
    sentAt: (row.sent_at as string) ?? null,
    createdById: row.created_by_id as string,
    createdAt: (row.created_at as string) ?? undefined,
    jobSite: jobSite ? { id: jobSite.id as string, name: jobSite.name as string } : undefined,
    recipientEmployeeIds: recipientEmployees.map((e) => e.id),
    recipientEmployees: recipientEmployees.length > 0 ? recipientEmployees : undefined,
  };
}

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    employeeId: (row.employee_id as string) ?? null,
    title: row.title as string,
    message: row.message as string,
    type: row.type as string,
    readAt: (row.read_at as string) ?? null,
    createdAt: (row.created_at as string) ?? undefined,
  };
}

async function createNotificationForEmployee(
  employeeId: string,
  title: string,
  message: string,
  type: string,
) {
  const { data: userRow } = await sb()
    .from('users')
    .select('id')
    .eq('employee_id', employeeId)
    .maybeSingle();
  await sb().from('notifications').insert({
    user_id: userRow?.id ?? null,
    employee_id: employeeId,
    title,
    message,
    type,
  });
}

async function createNotificationsForCustomerUsers(
  customerId: string,
  title: string,
  message: string,
  type: string,
) {
  const { data: users, error } = await sb()
    .from('users')
    .select('id')
    .eq('customer_id', customerId)
    .eq('role', 'CUSTOMER')
    .eq('status', 'ACTIVE');
  if (error) throw new DataError(error.message);
  if (!users?.length) return;
  await sb().from('notifications').insert(
    users.map((u) => ({
      user_id: u.id as string,
      employee_id: null,
      title,
      message,
      type,
    })),
  );
}

function mapUser(row: Record<string, unknown>): AuthUser {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as string,
    customerId: (row.customer_id as string) ?? null,
    employeeId: (row.employee_id as string) ?? null,
  };
}

function mapSettings(row: Record<string, unknown>): CompanySettings {
  return {
    id: row.id as string,
    companyName: row.company_name as string,
    officeEmail: (row.office_email as string) ?? null,
    dashboardSubdomain: (row.dashboard_subdomain as string) ?? null,
    smtpHost: (row.smtp_host as string) ?? null,
    smtpPort: row.smtp_port != null ? Number(row.smtp_port) : null,
    smtpUser: (row.smtp_user as string) ?? null,
    smtpFromEmail: (row.smtp_from_email as string) ?? null,
    smtpFromName: (row.smtp_from_name as string) ?? null,
    emailEnabled: Boolean(row.email_enabled),
    pushEnabled: Boolean(row.push_enabled),
  };
}

// --- API surface (same shape as former REST client) ---

export const data = {
  async getMe(): Promise<AuthUser> {
    const { data: session } = await sb().auth.getSession();
    if (!session.session?.user) throw new DataError('Not authenticated');
    const { data: row, error } = await sb()
      .from('users')
      .select('*')
      .eq('auth_user_id', session.session.user.id)
      .single();
    throwIf(error);
    return mapUser(row as Record<string, unknown>);
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const { data: stats, error } = await sb().rpc('get_admin_dashboard_stats');
    throwIf(error);
    const s = stats as Record<string, number>;
    const { data: recent, error: e2 } = await sb()
      .from('attendance_logs')
      .select(
        '*, employee:employees(id, first_name, last_name), job_site:job_sites(id, name), customer:customers(id, company_name)',
      )
      .order('clock_in_time', { ascending: false })
      .limit(10);
    throwIf(e2);
    return {
      totalEmployees: s.totalEmployees ?? 0,
      activeJobSites: s.activeJobSites ?? 0,
      clockedInToday: s.clockedInToday ?? 0,
      pendingJobOrders: s.pendingJobOrders ?? 0,
      signedTimesheets: s.signedTimesheets ?? 0,
      recentAttendance: (recent ?? []).map((r) => mapAttendance(r as Record<string, unknown>)),
    };
  },

  async getEmployees(params?: Record<string, string>): Promise<Employee[]> {
    let q = sb().from('employees').select('*').order('last_name');
    if (params?.status) q = q.eq('status', params.status);
    if (params?.search) {
      q = q.or(
        `first_name.ilike.%${params.search}%,last_name.ilike.%${params.search}%,email.ilike.%${params.search}%,position.ilike.%${params.search}%`,
      );
    }
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapEmployee(r as Record<string, unknown>));
  },

  async getEmployee(id: string): Promise<Employee> {
    const { data: row, error } = await sb().from('employees').select('*').eq('id', id).single();
    throwIf(error);
    return mapEmployee(row as Record<string, unknown>);
  },

  async createEmployee(payload: Partial<Employee>): Promise<Employee> {
    const { data: row, error } = await sb()
      .from('employees')
      .insert({
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        position: payload.position,
        hourly_rate: payload.hourlyRate,
        status: payload.status ?? 'ACTIVE',
      })
      .select()
      .single();
    throwIf(error);
    return mapEmployee(row as Record<string, unknown>);
  },

  async updateEmployee(id: string, payload: Partial<Employee>): Promise<Employee> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.firstName !== undefined) update.first_name = payload.firstName;
    if (payload.lastName !== undefined) update.last_name = payload.lastName;
    if (payload.email !== undefined) update.email = payload.email;
    if (payload.phone !== undefined) update.phone = payload.phone;
    if (payload.position !== undefined) update.position = payload.position;
    if (payload.hourlyRate !== undefined) update.hourly_rate = payload.hourlyRate;
    if (payload.status !== undefined) update.status = payload.status;
    const { data: row, error } = await sb()
      .from('employees')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    throwIf(error);
    return mapEmployee(row as Record<string, unknown>);
  },

  async deleteEmployee(id: string): Promise<{ deleted: boolean }> {
    const { error } = await sb().from('employees').delete().eq('id', id);
    throwIf(error);
    return { deleted: true };
  },

  async getCustomers(params?: Record<string, string>): Promise<Customer[]> {
    let q = sb()
      .from('customers')
      .select('*, job_sites(count), users(count)')
      .order('company_name');
    if (params?.search) {
      q = q.or(
        `company_name.ilike.%${params.search}%,contact_name.ilike.%${params.search}%`,
      );
    }
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapCustomer(r as Record<string, unknown>));
  },

  async getCustomer(id: string): Promise<CustomerDetail> {
    const { data: customer, error } = await sb()
      .from('customers')
      .select('*, job_sites(*), users(id, name, email, status, role)')
      .eq('id', id)
      .single();
    throwIf(error);
    const c = customer as Record<string, unknown>;
    const base = mapCustomer(c);
    const jobSites = ((c.job_sites as Record<string, unknown>[]) ?? []).map((js) =>
      mapJobSite(js),
    );
    const users = ((c.users as Record<string, unknown>[]) ?? []).map((u) => ({
      id: u.id as string,
      name: u.name as string,
      email: u.email as string,
      status: u.status as string,
      role: u.role as string,
    }));
    return { ...base, jobSites, users };
  },

  async createCustomer(payload: Partial<Customer>): Promise<Customer> {
    const { data: row, error } = await sb()
      .from('customers')
      .insert({
        company_name: payload.companyName,
        contact_name: payload.contactName,
        contact_email: payload.contactEmail,
        contact_phone: payload.contactPhone,
        office_email: payload.officeEmail,
        address: payload.address,
        status: payload.status ?? 'ACTIVE',
      })
      .select()
      .single();
    throwIf(error);
    return mapCustomer(row as Record<string, unknown>);
  },

  async updateCustomer(id: string, payload: Partial<Customer>): Promise<Customer> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.companyName !== undefined) update.company_name = payload.companyName;
    if (payload.contactName !== undefined) update.contact_name = payload.contactName;
    if (payload.contactEmail !== undefined) update.contact_email = payload.contactEmail;
    if (payload.contactPhone !== undefined) update.contact_phone = payload.contactPhone;
    if (payload.officeEmail !== undefined) update.office_email = payload.officeEmail;
    if (payload.address !== undefined) update.address = payload.address;
    if (payload.status !== undefined) update.status = payload.status;
    const { data: row, error } = await sb()
      .from('customers')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    throwIf(error);
    return mapCustomer(row as Record<string, unknown>);
  },

  async deleteCustomer(id: string): Promise<{ deleted: boolean }> {
    const { error } = await sb().from('customers').delete().eq('id', id);
    throwIf(error);
    return { deleted: true };
  },

  async bulkCreateCustomers(rows: BulkCustomerRow[]): Promise<BulkImportResult> {
    const result: BulkImportResult = { imported: 0, skipped: 0, errors: [] };
    const existing = await data.getCustomers();
    const names = new Set(existing.map((c) => c.companyName.toLowerCase()));

    const BATCH = 25;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      for (let j = 0; j < batch.length; j++) {
        const rowIndex = i + j + 1;
        const row = batch[j];
        const nameKey = row.companyName.trim().toLowerCase();
        if (names.has(nameKey)) {
          result.skipped += 1;
          result.errors.push({ row: rowIndex, message: 'Duplicate company name' });
          continue;
        }
        try {
          await data.createCustomer({
            companyName: row.companyName,
            contactName: row.contactName || null,
            contactEmail: row.contactEmail || null,
            contactPhone: row.contactPhone || null,
            officeEmail: row.officeEmail || null,
            address: row.address || null,
            status: row.status ?? 'ACTIVE',
          });
          names.add(nameKey);
          result.imported += 1;
        } catch (err) {
          result.skipped += 1;
          result.errors.push({
            row: rowIndex,
            message: err instanceof Error ? err.message : 'Insert failed',
          });
        }
      }
    }
    return result;
  },

  async bulkCreateEmployees(
    rows: BulkEmployeeRow[],
    options?: { createPortalAccess?: boolean },
  ): Promise<BulkImportResult> {
    const { data: session } = await sb().auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/bulk-create-workers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          rows,
          createPortalAccess: options?.createPortalAccess ?? false,
        }),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new DataError(json.error || 'Bulk import failed');
    return json as BulkImportResult;
  },

  async createCustomerUser(
    customerId: string,
    input: CreateCustomerUserInput,
  ): Promise<unknown> {
    return createAppUser({
      name: input.name,
      email: input.email,
      password: input.password,
      phone: input.phone,
      role: 'CUSTOMER',
      customerId,
    });
  },

  async createWorkerUser(
    employeeId: string,
    input: CreateWorkerUserInput,
  ): Promise<unknown> {
    return createAppUser({
      name: input.name,
      email: input.email,
      password: input.password,
      phone: input.phone,
      role: 'WORKER',
      employeeId,
    });
  },

  async getJobSites(params?: Record<string, string>): Promise<JobSite[]> {
    let q = sb()
      .from('job_sites')
      .select('*, customer:customers(id, company_name)')
      .order('name');
    if (params?.customerId) q = q.eq('customer_id', params.customerId);
    if (params?.status) q = q.eq('status', params.status);
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapJobSite(r as Record<string, unknown>));
  },

  async getJobSite(id: string): Promise<JobSite> {
    const { data: row, error } = await sb()
      .from('job_sites')
      .select('*, customer:customers(id, company_name)')
      .eq('id', id)
      .single();
    throwIf(error);
    return mapJobSite(row as Record<string, unknown>);
  },

  async createJobSite(payload: Partial<JobSite>): Promise<JobSite> {
    const { data: row, error } = await sb()
      .from('job_sites')
      .insert({
        customer_id: payload.customerId,
        name: payload.name,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        zip_code: payload.zipCode,
        foreman_name: payload.foremanName,
        foreman_phone: payload.foremanPhone,
        foreman_email: payload.foremanEmail,
        status: payload.status ?? 'ACTIVE',
      })
      .select('*, customer:customers(id, company_name)')
      .single();
    throwIf(error);
    return mapJobSite(row as Record<string, unknown>);
  },

  async updateJobSite(id: string, payload: Partial<JobSite>): Promise<JobSite> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.customerId !== undefined) update.customer_id = payload.customerId;
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.address !== undefined) update.address = payload.address;
    if (payload.city !== undefined) update.city = payload.city;
    if (payload.state !== undefined) update.state = payload.state;
    if (payload.zipCode !== undefined) update.zip_code = payload.zipCode;
    if (payload.foremanName !== undefined) update.foreman_name = payload.foremanName;
    if (payload.foremanPhone !== undefined) update.foreman_phone = payload.foremanPhone;
    if (payload.foremanEmail !== undefined) update.foreman_email = payload.foremanEmail;
    if (payload.status !== undefined) update.status = payload.status;
    const { data: row, error } = await sb()
      .from('job_sites')
      .update(update)
      .eq('id', id)
      .select('*, customer:customers(id, company_name)')
      .single();
    throwIf(error);
    return mapJobSite(row as Record<string, unknown>);
  },

  async deleteJobSite(id: string): Promise<{ deleted: boolean }> {
    const { error } = await sb().from('job_sites').delete().eq('id', id);
    throwIf(error);
    return { deleted: true };
  },

  async getAssignments(params?: Record<string, string>): Promise<Assignment[]> {
    let q = sb()
      .from('job_assignments')
      .select(
        '*, employee:employees(*), customer:customers(id, company_name), job_site:job_sites(id, name, address)',
      )
      .order('assigned_date', { ascending: false });
    if (params?.employeeId) q = q.eq('employee_id', params.employeeId);
    if (params?.customerId) q = q.eq('customer_id', params.customerId);
    if (params?.jobSiteId) q = q.eq('job_site_id', params.jobSiteId);
    if (params?.status) q = q.eq('status', params.status);
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapAssignment(r as Record<string, unknown>));
  },

  async createAssignment(payload: Partial<Assignment>): Promise<Assignment> {
    const { data: row, error } = await sb()
      .from('job_assignments')
      .insert({
        employee_id: payload.employeeId,
        customer_id: payload.customerId,
        job_site_id: payload.jobSiteId,
        assigned_date: payload.assignedDate,
        start_time: payload.startTime,
        end_time: payload.endTime,
        status: payload.status ?? 'PENDING',
        notes: payload.notes,
      })
      .select(
        '*, employee:employees(*), customer:customers(id, company_name), job_site:job_sites(id, name, address)',
      )
      .single();
    throwIf(error);
    return mapAssignment(row as Record<string, unknown>);
  },

  async updateAssignment(id: string, payload: Partial<Assignment>): Promise<Assignment> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.status !== undefined) update.status = payload.status;
    if (payload.startTime !== undefined) update.start_time = payload.startTime;
    if (payload.endTime !== undefined) update.end_time = payload.endTime;
    if (payload.notes !== undefined) update.notes = payload.notes;
    if (payload.employeeId !== undefined) update.employee_id = payload.employeeId;
    if (payload.customerId !== undefined) update.customer_id = payload.customerId;
    if (payload.jobSiteId !== undefined) update.job_site_id = payload.jobSiteId;
    if (payload.assignedDate !== undefined) update.assigned_date = payload.assignedDate;
    if (payload.endDate !== undefined) update.end_date = payload.endDate;
    const { data: row, error } = await sb()
      .from('job_assignments')
      .update(update)
      .eq('id', id)
      .select(
        '*, employee:employees(*), customer:customers(id, company_name), job_site:job_sites(id, name, address)',
      )
      .single();
    throwIf(error);
    return mapAssignment(row as Record<string, unknown>);
  },

  async getOpenAssignmentsForEmployee(
    employeeId: string,
    _assignedDate?: string,
    excludeId?: string,
  ): Promise<Assignment[]> {
    let q = sb()
      .from('job_assignments')
      .select(
        '*, employee:employees(*), customer:customers(id, company_name), job_site:job_sites(id, name, address)',
      )
      .eq('employee_id', employeeId)
      .in('status', ['PENDING', 'ACCEPTED', 'ACTIVE']);
    if (excludeId) q = q.neq('id', excludeId);
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapAssignment(r as Record<string, unknown>));
  },

  async endAssignment(
    id: string,
    status: 'COMPLETED' | 'CANCELLED',
    endDate?: string,
  ): Promise<Assignment> {
    return data.updateAssignment(id, {
      status,
      ...(endDate ? { endDate } : {}),
    });
  },

  async endAssignments(ids: string[], status: 'COMPLETED' | 'CANCELLED'): Promise<void> {
    await Promise.all(ids.map((id) => data.endAssignment(id, status)));
  },

  async createAssignmentResolvingConflicts(
    payload: Partial<Assignment>,
    endConflicts = false,
  ): Promise<Assignment> {
    if (!payload.employeeId || !payload.assignedDate) {
      return data.createAssignment(payload);
    }
    const conflicts = await data.getOpenAssignmentsForEmployee(payload.employeeId);
    if (conflicts.length > 0 && !endConflicts) {
      const names = conflicts
        .map((c) => `${c.jobSite?.name ?? 'job site'} (${c.status})`)
        .join(', ');
      throw new DataError(
        `Employee has an open assignment: ${names}. End it first or confirm to replace.`,
      );
    }
    if (conflicts.length > 0 && endConflicts) {
      await data.endAssignments(
        conflicts.map((c) => c.id),
        'COMPLETED',
      );
    }
    return data.createAssignment(payload);
  },

  async deleteAssignment(id: string): Promise<{ deleted: boolean }> {
    const { error } = await sb().from('job_assignments').delete().eq('id', id);
    throwIf(error);
    return { deleted: true };
  },

  async getAttendance(params?: Record<string, string>): Promise<AttendanceLog[]> {
    let q = sb()
      .from('attendance_logs')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .order('clock_in_time', { ascending: false });
    if (params?.employeeId) q = q.eq('employee_id', params.employeeId);
    if (params?.customerId) q = q.eq('customer_id', params.customerId);
    if (params?.jobSiteId) q = q.eq('job_site_id', params.jobSiteId);
    if (params?.status) q = q.eq('status', params.status);
    if (params?.date) {
      const start = `${params.date}T00:00:00`;
      const end = `${params.date}T23:59:59`;
      q = q.gte('clock_in_time', start).lte('clock_in_time', end);
    }
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapAttendance(r as Record<string, unknown>));
  },

  async getAttendanceToday(): Promise<AttendanceLog[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: rows, error } = await sb()
      .from('attendance_logs')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .gte('clock_in_time', start.toISOString())
      .order('clock_in_time', { ascending: false });
    throwIf(error);
    return (rows ?? []).map((r) => mapAttendance(r as Record<string, unknown>));
  },

  async getCustomerPortalDashboard(): Promise<CustomerDashboard> {
    const me = await data.getMe();
    if (!me.customerId) throw new DataError('No customer linked');
    const { data: customer, error: e1 } = await sb()
      .from('customers')
      .select('*')
      .eq('id', me.customerId)
      .single();
    throwIf(e1);
    const { data: stats, error: e2 } = await sb().rpc('get_customer_dashboard_stats', {
      p_customer_id: me.customerId,
    });
    throwIf(e2);
    const s = stats as Record<string, number>;
    const { data: assignmentRows, error: eA } = await sb()
      .from('job_assignments')
      .select(
        '*, employee:employees(*), customer:customers(id, company_name), job_site:job_sites(id, name, address)',
      )
      .eq('customer_id', me.customerId)
      .in('status', ['ACTIVE', 'ACCEPTED'])
      .order('assigned_date', { ascending: false });
    throwIf(eA);
    const assignments = (assignmentRows ?? []).map((r) =>
      mapAssignment(r as Record<string, unknown>),
    );
    const todayAttendance = await data.getAttendance({
      customerId: me.customerId,
      date: new Date().toISOString().slice(0, 10),
    });
    const { data: timesheets, error: e3 } = await sb()
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .eq('customer_id', me.customerId)
      .in('status', ['SIGNED', 'SENT', 'APPROVED'])
      .order('created_at', { ascending: false })
      .limit(10);
    throwIf(e3);
    const { data: jobOrders, error: e4 } = await sb()
      .from('job_orders')
      .select('*, job_site:job_sites(id, name), employee:employees(id, first_name, last_name)')
      .eq('customer_id', me.customerId)
      .order('created_at', { ascending: false })
      .limit(10);
    throwIf(e4);
    return {
      customer: mapCustomer(customer as Record<string, unknown>),
      stats: {
        activeJobSites: s.activeJobSites ?? 0,
        workersAssigned: s.workersAssigned ?? 0,
        clockedInToday: s.clockedInToday ?? 0,
        signedTimesheets: s.signedTimesheets ?? 0,
      },
      assignments,
      todayAttendance,
      signedTimesheets: (timesheets ?? []).map((t) => mapTimesheet(t as Record<string, unknown>)),
      jobOrders: jobOrders ?? [],
    };
  },

  async getCustomerPortalJobSites(): Promise<CustomerJobSite[]> {
    const me = await data.getMe();
    if (!me.customerId) throw new DataError('No customer linked');
    const { data: rows, error } = await sb()
      .from('job_sites')
      .select(
        '*, assignments:job_assignments(*, employee:employees(id, first_name, last_name, position))',
      )
      .eq('customer_id', me.customerId)
      .eq('status', 'ACTIVE');
    throwIf(error);
    return (rows ?? []).map((r) => {
      const site = mapJobSite(r as Record<string, unknown>);
      const assignments = ((r as Record<string, unknown>).assignments as Record<string, unknown>[]) ?? [];
      return {
        ...site,
        assignments: assignments.map((a) => mapAssignment(a)),
      };
    });
  },

  async getCustomerPortalAttendance(date?: string): Promise<AttendanceLog[]> {
    const me = await data.getMe();
    return data.getAttendance({
      customerId: me.customerId!,
      ...(date ? { date } : {}),
    });
  },

  async getCustomerPortalTimesheets(): Promise<Timesheet[]> {
    const me = await data.getMe();
    if (!me.customerId) throw new DataError('No customer linked');
    const { data: rows, error } = await sb()
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .eq('customer_id', me.customerId)
      .order('created_at', { ascending: false });
    throwIf(error);
    return (rows ?? []).map((r) => mapTimesheet(r as Record<string, unknown>));
  },

  async getSettings(): Promise<CompanySettings> {
    const { data: rows, error } = await sb().from('company_settings').select('*').limit(1);
    throwIf(error);
    if (!rows?.length) throw new DataError('Settings not found');
    return mapSettings(rows[0] as Record<string, unknown>);
  },

  async updateSettings(payload: Partial<CompanySettings>): Promise<CompanySettings> {
    const current = await data.getSettings();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.companyName !== undefined) update.company_name = payload.companyName;
    if (payload.officeEmail !== undefined) update.office_email = payload.officeEmail;
    if (payload.dashboardSubdomain !== undefined) update.dashboard_subdomain = payload.dashboardSubdomain;
    if (payload.smtpHost !== undefined) update.smtp_host = payload.smtpHost || null;
    if (payload.smtpPort !== undefined) update.smtp_port = payload.smtpPort ?? null;
    if (payload.smtpUser !== undefined) update.smtp_user = payload.smtpUser || null;
    if (payload.smtpFromEmail !== undefined) update.smtp_from_email = payload.smtpFromEmail || null;
    if (payload.smtpFromName !== undefined) update.smtp_from_name = payload.smtpFromName || null;
    if (payload.emailEnabled !== undefined) update.email_enabled = payload.emailEnabled;
    if (payload.pushEnabled !== undefined) update.push_enabled = payload.pushEnabled;
    const { data: row, error } = await sb()
      .from('company_settings')
      .update(update)
      .eq('id', current.id)
      .select()
      .single();
    throwIf(error);
    return mapSettings(row as Record<string, unknown>);
  },

  async sendTestEmail(recipientEmail: string): Promise<void> {
    const { data: session } = await sb().auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-test-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ recipientEmail }),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new DataError(json.error || 'Failed to send test email');
  },

  // --- Milestone 2: Job Orders ---

  async getJobOrders(params?: Record<string, string>): Promise<JobOrder[]> {
    let q = sb()
      .from('job_orders')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .order('created_at', { ascending: false });
    if (params?.customerId) q = q.eq('customer_id', params.customerId);
    if (params?.jobSiteId) q = q.eq('job_site_id', params.jobSiteId);
    if (params?.status) q = q.eq('status', params.status);
    if (params?.search) {
      q = q.or(
        `title.ilike.%${params.search}%,order_number.ilike.%${params.search}%,description.ilike.%${params.search}%`,
      );
    }
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapJobOrder(r as Record<string, unknown>));
  },

  async getJobOrder(id: string): Promise<JobOrder> {
    const { data: row, error } = await sb()
      .from('job_orders')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .eq('id', id)
      .single();
    throwIf(error);
    return mapJobOrder(row as Record<string, unknown>);
  },

  async createJobOrder(payload: Partial<JobOrder>): Promise<JobOrder> {
    const me = await data.getMe();
    const { data: row, error } = await sb()
      .from('job_orders')
      .insert({
        order_number: payload.orderNumber,
        customer_id: payload.customerId,
        job_site_id: payload.jobSiteId,
        employee_id: payload.employeeId ?? null,
        title: payload.title,
        description: payload.description,
        start_date: payload.startDate,
        start_time: payload.startTime,
        required_position: payload.requiredPosition,
        instructions: payload.instructions,
        safety_notes: payload.safetyNotes,
        status: payload.status ?? 'DRAFT',
        created_by_id: me.id,
      })
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .single();
    throwIf(error);
    return mapJobOrder(row as Record<string, unknown>);
  },

  async updateJobOrder(id: string, payload: Partial<JobOrder>): Promise<JobOrder> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.orderNumber !== undefined) update.order_number = payload.orderNumber;
    if (payload.customerId !== undefined) update.customer_id = payload.customerId;
    if (payload.jobSiteId !== undefined) update.job_site_id = payload.jobSiteId;
    if (payload.employeeId !== undefined) update.employee_id = payload.employeeId;
    if (payload.title !== undefined) update.title = payload.title;
    if (payload.description !== undefined) update.description = payload.description;
    if (payload.startDate !== undefined) update.start_date = payload.startDate;
    if (payload.startTime !== undefined) update.start_time = payload.startTime;
    if (payload.requiredPosition !== undefined) update.required_position = payload.requiredPosition;
    if (payload.instructions !== undefined) update.instructions = payload.instructions;
    if (payload.safetyNotes !== undefined) update.safety_notes = payload.safetyNotes;
    if (payload.status !== undefined) update.status = payload.status;
    const { data: row, error } = await sb()
      .from('job_orders')
      .update(update)
      .eq('id', id)
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .single();
    throwIf(error);
    return mapJobOrder(row as Record<string, unknown>);
  },

  async sendJobOrder(id: string): Promise<JobOrder> {
    const order = await data.getJobOrder(id);
    const now = new Date().toISOString();
    const { data: row, error } = await sb()
      .from('job_orders')
      .update({ status: 'SENT', sent_at: now, updated_at: now })
      .eq('id', id)
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .single();
    throwIf(error);
    if (order.employeeId) {
      const title = `Job Order: ${order.title}`;
      const message = `You have a new job order (${order.orderNumber}) starting ${order.startDate}.`;
      await createNotificationForEmployee(order.employeeId, title, message, 'JOB_ORDER');
      const { data: employee } = await sb()
        .from('employees')
        .select('email')
        .eq('id', order.employeeId)
        .maybeSingle();
      const workerEmail = (employee?.email as string) ?? '';
      if (workerEmail) {
        await sendTransactionalEmail({
          template: 'JOB_ORDER',
          recipientEmail: workerEmail,
          subject: title,
          relatedId: id,
          context: {
            orderNumber: order.orderNumber,
            startDate: order.startDate,
            instructions: order.instructions ?? '',
          },
        });
      }
      await sendPushNotification({
        employeeId: order.employeeId,
        title,
        body: message,
        data: { type: 'JOB_ORDER', id },
      });
    }
    return mapJobOrder(row as Record<string, unknown>);
  },

  // --- Milestone 2: Timesheets ---

  async getTimesheets(params?: Record<string, string>): Promise<Timesheet[]> {
    let q = sb()
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .order('created_at', { ascending: false });
    if (params?.employeeId) q = q.eq('employee_id', params.employeeId);
    if (params?.customerId) q = q.eq('customer_id', params.customerId);
    if (params?.jobSiteId) q = q.eq('job_site_id', params.jobSiteId);
    if (params?.status) q = q.eq('status', params.status);
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapTimesheet(r as Record<string, unknown>));
  },

  async getTimesheet(id: string): Promise<Timesheet> {
    const { data: row, error } = await sb()
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*), entries:timesheet_entries(*)',
      )
      .eq('id', id)
      .single();
    throwIf(error);
    return mapTimesheet(row as Record<string, unknown>);
  },

  async createTimesheet(payload: {
    employeeId: string;
    customerId: string;
    jobSiteId: string;
    assignmentId?: string;
    workDate?: string;
    weekStartDate?: string;
    weekEndDate?: string;
    totalHours: number;
    notes?: string;
    status?: string;
  }): Promise<Timesheet> {
    const { data: row, error } = await sb()
      .from('timesheets')
      .insert({
        employee_id: payload.employeeId,
        customer_id: payload.customerId,
        job_site_id: payload.jobSiteId,
        assignment_id: payload.assignmentId ?? null,
        work_date: payload.workDate ?? null,
        week_start_date: payload.weekStartDate ?? null,
        week_end_date: payload.weekEndDate ?? null,
        total_hours: payload.totalHours,
        notes: payload.notes ?? null,
        status: payload.status ?? 'DRAFT',
      })
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .single();
    throwIf(error);
    return mapTimesheet(row as Record<string, unknown>);
  },

  async updateTimesheet(
    id: string,
    payload: Partial<{
      totalHours: number;
      notes: string;
      status: string;
      workDate: string;
      weekStartDate: string;
      weekEndDate: string;
    }>,
  ): Promise<Timesheet> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.totalHours !== undefined) update.total_hours = payload.totalHours;
    if (payload.notes !== undefined) update.notes = payload.notes;
    if (payload.status !== undefined) update.status = payload.status;
    if (payload.workDate !== undefined) update.work_date = payload.workDate;
    if (payload.weekStartDate !== undefined) update.week_start_date = payload.weekStartDate;
    if (payload.weekEndDate !== undefined) update.week_end_date = payload.weekEndDate;
    const { data: row, error } = await sb()
      .from('timesheets')
      .update(update)
      .eq('id', id)
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .single();
    throwIf(error);
    return mapTimesheet(row as Record<string, unknown>);
  },

  async signTimesheet(
    id: string,
    payload: { foremanName: string; foremanEmail?: string; signatureDataUrl: string },
  ): Promise<Timesheet> {
    const timesheet = await data.getTimesheet(id);
    let imageUrl = payload.signatureDataUrl;
    if (imageUrl.startsWith('data:')) {
      imageUrl = await uploadDataUrl(
        'signatures',
        payload.signatureDataUrl,
        `timesheet-${id}.png`,
        'timesheets',
      );
    }
    const { error } = await sb().rpc('sign_timesheet', {
      p_timesheet_id: id,
      p_foreman_name: payload.foremanName,
      p_foreman_email: payload.foremanEmail ?? '',
      p_signature_image_url: imageUrl,
    });
    throwIf(error);
    if (timesheet.customerId) {
      const title = 'Timesheet Signed';
      const message = `A timesheet has been signed for ${timesheet.jobSite?.name ?? 'your job site'}.`;
      await createNotificationsForCustomerUsers(timesheet.customerId, title, message, 'SYSTEM');
      const { data: customer } = await sb()
        .from('customers')
        .select('office_email, company_name')
        .eq('id', timesheet.customerId)
        .maybeSingle();
      const recipientEmail =
        (payload.foremanEmail as string) || (customer?.office_email as string) || '';
      if (recipientEmail) {
        await sendTransactionalEmail({
          template: 'TIMESHEET_SIGNED',
          recipientEmail,
          subject: title,
          relatedId: id,
          context: {
            jobSiteName: timesheet.jobSite?.name ?? '',
            foremanName: payload.foremanName,
            companyName: (customer?.company_name as string) ?? '',
          },
        });
      }
      const { data: customerUsers } = await sb()
        .from('users')
        .select('id')
        .eq('customer_id', timesheet.customerId)
        .eq('role', 'CUSTOMER')
        .eq('status', 'ACTIVE');
      for (const u of customerUsers ?? []) {
        await sendPushNotification({
          userId: u.id as string,
          title,
          body: message,
          data: { type: 'TIMESHEET_SIGNED', id },
        });
      }
    }
    return data.getTimesheet(id);
  },

  async markTimesheetSent(
    id: string,
    flags: { sentToCustomerOffice?: boolean; sentToMcLaborOffice?: boolean },
  ): Promise<Timesheet> {
    const update: Record<string, unknown> = {};
    if (flags.sentToCustomerOffice !== undefined) {
      update.sent_to_customer_office = flags.sentToCustomerOffice;
    }
    if (flags.sentToMcLaborOffice !== undefined) {
      update.sent_to_mc_labor_office = flags.sentToMcLaborOffice;
    }
    const { error: sigError } = await sb()
      .from('timesheet_signatures')
      .update(update)
      .eq('timesheet_id', id);
    throwIf(sigError);
    const tsUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (flags.sentToCustomerOffice || flags.sentToMcLaborOffice) {
      tsUpdate.status = 'SENT';
    }
    const { data: row, error } = await sb()
      .from('timesheets')
      .update(tsUpdate)
      .eq('id', id)
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .single();
    throwIf(error);
    const mapped = mapTimesheet(row as Record<string, unknown>);
    if (flags.sentToCustomerOffice && mapped.customerId) {
      const title = 'Timesheet Sent to Office';
      const message = `Signed timesheet for ${mapped.jobSite?.name ?? 'job site'} was marked sent to your office.`;
      await createNotificationsForCustomerUsers(mapped.customerId, title, message, 'SYSTEM');
      const { data: customer } = await sb()
        .from('customers')
        .select('office_email')
        .eq('id', mapped.customerId)
        .maybeSingle();
      const customerEmail = (customer?.office_email as string) ?? '';
      if (customerEmail) {
        await sendTransactionalEmail({
          template: 'TIMESHEET_SENT',
          recipientEmail: customerEmail,
          subject: title,
          relatedId: id,
          context: { jobSiteName: mapped.jobSite?.name ?? '' },
        });
      }
      const { data: customerUsers } = await sb()
        .from('users')
        .select('id')
        .eq('customer_id', mapped.customerId)
        .eq('role', 'CUSTOMER')
        .eq('status', 'ACTIVE');
      for (const u of customerUsers ?? []) {
        await sendPushNotification({
          userId: u.id as string,
          title,
          body: message,
          data: { type: 'TIMESHEET_SENT', id },
        });
      }
    }
    if (flags.sentToMcLaborOffice) {
      await invokeEdgeFunction('send-transactional-email', {
        template: 'TIMESHEET_SENT',
        useMcLaborOfficeEmail: true,
        subject: 'Timesheet sent to MC Labor office',
        relatedId: id,
        context: { jobSiteName: mapped.jobSite?.name ?? '' },
      });
    }
    return mapped;
  },

  async rollupWeeklyTimesheet(payload: {
    employeeId: string;
    customerId: string;
    jobSiteId: string;
    weekStart: string;
    weekEnd: string;
    status?: string;
  }): Promise<Timesheet> {
    const { data: timesheetId, error } = await sb().rpc('rollup_weekly_timesheet', {
      p_employee_id: payload.employeeId,
      p_customer_id: payload.customerId,
      p_job_site_id: payload.jobSiteId,
      p_week_start: payload.weekStart,
      p_week_end: payload.weekEnd,
      p_status: payload.status ?? 'SUBMITTED',
    });
    throwIf(error);
    return data.getTimesheet(timesheetId as string);
  },

  // --- Milestone 2: Documents ---

  async getDocuments(): Promise<Document[]> {
    const { data: rows, error } = await sb()
      .from('documents')
      .select('*, uploaded_by:users(id, name)')
      .order('created_at', { ascending: false });
    throwIf(error);
    return (rows ?? []).map((r) => mapDocument(r as Record<string, unknown>));
  },

  async uploadDocument(payload: {
    title: string;
    description?: string;
    category: string;
    file: File;
  }): Promise<Document> {
    const me = await data.getMe();
    const fileUrl = await uploadFile('documents', payload.file, 'docs');
    const { data: row, error } = await sb()
      .from('documents')
      .insert({
        title: payload.title,
        description: payload.description ?? null,
        file_url: fileUrl,
        category: payload.category,
        uploaded_by_id: me.id,
      })
      .select('*, uploaded_by:users(id, name)')
      .single();
    throwIf(error);
    return mapDocument(row as Record<string, unknown>);
  },

  async deleteDocument(id: string): Promise<{ deleted: boolean }> {
    const doc = await sb().from('documents').select('file_url').eq('id', id).single();
    const { error } = await sb().from('documents').delete().eq('id', id);
    throwIf(error);
    if (doc.data?.file_url) {
      try {
        const { deleteStorageFile } = await import('./storage');
        await deleteStorageFile('documents', doc.data.file_url as string);
      } catch {
        // ignore storage cleanup errors
      }
    }
    return { deleted: true };
  },

  // --- Milestone 2: Safety Bulletins ---

  async getSafetyBulletins(): Promise<SafetyBulletin[]> {
    const { data: rows, error } = await sb()
      .from('safety_bulletins')
      .select(
        '*, job_site:job_sites(id, name), recipients:safety_bulletin_recipients(employee_id, employee:employees(id, first_name, last_name))',
      )
      .order('created_at', { ascending: false });
    throwIf(error);
    return (rows ?? []).map((r) => mapSafetyBulletin(r as Record<string, unknown>));
  },

  async createSafetyBulletin(payload: {
    title: string;
    message: string;
    audience: string;
    jobSiteId?: string;
    fileUrl?: string;
    employeeIds?: string[];
  }): Promise<SafetyBulletin> {
    const me = await data.getMe();
    const { data: row, error } = await sb()
      .from('safety_bulletins')
      .insert({
        title: payload.title,
        message: payload.message,
        audience: payload.audience,
        job_site_id: payload.jobSiteId ?? null,
        file_url: payload.fileUrl ?? null,
        created_by_id: me.id,
      })
      .select(
        '*, job_site:job_sites(id, name), recipients:safety_bulletin_recipients(employee_id, employee:employees(id, first_name, last_name))',
      )
      .single();
    throwIf(error);
    if (payload.audience === 'SPECIFIC_WORKERS' && payload.employeeIds?.length) {
      const { error: recipientError } = await sb().from('safety_bulletin_recipients').insert(
        payload.employeeIds.map((employeeId) => ({
          bulletin_id: row.id as string,
          employee_id: employeeId,
        })),
      );
      throwIf(recipientError);
      return data.getSafetyBulletins().then((list) => {
        const found = list.find((b) => b.id === row.id);
        if (!found) throw new DataError('Failed to load created bulletin');
        return found;
      });
    }
    return mapSafetyBulletin(row as Record<string, unknown>);
  },

  async uploadSafetyBulletinFile(file: File): Promise<string> {
    return uploadFile('safety-bulletins', file, 'bulletins');
  },

  async sendSafetyBulletin(id: string): Promise<SafetyBulletin> {
    const bulletin = await data.getSafetyBulletins().then((list) => list.find((b) => b.id === id));
    if (!bulletin) throw new DataError('Bulletin not found');
    const now = new Date().toISOString();
    const { data: row, error } = await sb()
      .from('safety_bulletins')
      .update({ sent_at: now, updated_at: now })
      .eq('id', id)
      .select('*, job_site:job_sites(id, name)')
      .single();
    throwIf(error);

    let employeeIds: string[] = [];
    if (bulletin.audience === 'ALL_EMPLOYEES') {
      const { data: employees } = await sb().from('employees').select('id').eq('status', 'ACTIVE');
      employeeIds = (employees ?? []).map((e) => e.id as string);
    } else if (bulletin.audience === 'SPECIFIC_JOB_SITE' && bulletin.jobSiteId) {
      const { data: assignments } = await sb()
        .from('job_assignments')
        .select('employee_id')
        .eq('job_site_id', bulletin.jobSiteId)
        .in('status', ['ACTIVE', 'ACCEPTED']);
      employeeIds = [...new Set((assignments ?? []).map((a) => a.employee_id as string))];
    } else if (bulletin.audience === 'SPECIFIC_WORKERS') {
      const { data: recipients, error: recipientError } = await sb()
        .from('safety_bulletin_recipients')
        .select('employee_id')
        .eq('bulletin_id', id);
      throwIf(recipientError);
      employeeIds = (recipients ?? []).map((r) => r.employee_id as string);
    }

    for (const employeeId of employeeIds) {
      const title = `Safety: ${bulletin.title}`;
      await createNotificationForEmployee(employeeId, title, bulletin.message, 'SAFETY');
      const { data: employee } = await sb()
        .from('employees')
        .select('email')
        .eq('id', employeeId)
        .maybeSingle();
      const workerEmail = (employee?.email as string) ?? '';
      if (workerEmail) {
        await sendTransactionalEmail({
          template: 'SAFETY',
          recipientEmail: workerEmail,
          subject: title,
          relatedId: id,
          context: { message: bulletin.message },
        });
      }
      await sendPushNotification({
        employeeId,
        title,
        body: bulletin.message,
        data: { type: 'SAFETY', id },
      });
    }
    return mapSafetyBulletin(row as Record<string, unknown>);
  },

  // --- Milestone 2: Notifications ---

  async getNotifications(): Promise<Notification[]> {
    const { data: rows, error } = await sb()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    throwIf(error);
    return (rows ?? []).map((r) => mapNotification(r as Record<string, unknown>));
  },

  async createNotification(payload: {
    title: string;
    message: string;
    type: string;
    userId?: string;
    employeeId?: string;
  }): Promise<Notification> {
    const { data: row, error } = await sb()
      .from('notifications')
      .insert({
        title: payload.title,
        message: payload.message,
        type: payload.type,
        user_id: payload.userId ?? null,
        employee_id: payload.employeeId ?? null,
      })
      .select('*')
      .single();
    throwIf(error);
    return mapNotification(row as Record<string, unknown>);
  },

  async markNotificationRead(id: string): Promise<Notification> {
    const { data: row, error } = await sb()
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    throwIf(error);
    return mapNotification(row as Record<string, unknown>);
  },

  // --- Milestone 3: Supervisors ---

  async getSupervisors(): Promise<SupervisorUser[]> {
    const { data: rows, error } = await sb()
      .from('users')
      .select('*')
      .eq('role', 'SUPERVISOR')
      .order('name');
    throwIf(error);
    const supervisors = (rows ?? []).map((row) => mapUser(row as Record<string, unknown>));
    const withCounts = await Promise.all(
      supervisors.map(async (user) => ({
        ...user,
        assignedJobSiteCount: (await data.getSupervisorJobSiteIds(user.id)).length,
      })),
    );
    return withCounts;
  },

  async createSupervisorUser(input: CreateWorkerUserInput): Promise<unknown> {
    return createAppUser({
      name: input.name,
      email: input.email,
      password: input.password,
      phone: input.phone,
      role: 'SUPERVISOR',
    });
  },

  async getSupervisorJobSiteIds(userId: string): Promise<string[]> {
    const { data: rows, error } = await sb()
      .from('supervisor_job_sites')
      .select('job_site_id')
      .eq('user_id', userId);
    throwIf(error);
    return (rows ?? []).map((r) => r.job_site_id as string);
  },

  async getJobSiteSupervisorIds(jobSiteId: string): Promise<string[]> {
    const { data: rows, error } = await sb()
      .from('supervisor_job_sites')
      .select('user_id')
      .eq('job_site_id', jobSiteId);
    throwIf(error);
    return (rows ?? []).map((r) => r.user_id as string);
  },

  async setJobSiteSupervisors(jobSiteId: string, userIds: string[]): Promise<void> {
    const { error: delError } = await sb()
      .from('supervisor_job_sites')
      .delete()
      .eq('job_site_id', jobSiteId);
    throwIf(delError);
    if (userIds.length === 0) return;
    const { error } = await sb()
      .from('supervisor_job_sites')
      .insert(userIds.map((userId) => ({ user_id: userId, job_site_id: jobSiteId })));
    throwIf(error);
  },

  async setSupervisorJobSites(userId: string, jobSiteIds: string[]): Promise<void> {
    const { error: delError } = await sb().from('supervisor_job_sites').delete().eq('user_id', userId);
    throwIf(delError);
    if (jobSiteIds.length === 0) return;
    const { error } = await sb()
      .from('supervisor_job_sites')
      .insert(jobSiteIds.map((jobSiteId) => ({ user_id: userId, job_site_id: jobSiteId })));
    throwIf(error);
  },

  async getMySupervisorJobSiteIds(): Promise<string[]> {
    const me = await data.getMe();
    return data.getSupervisorJobSiteIds(me.id);
  },

  async getSupervisorPortalDashboard(): Promise<SupervisorDashboard> {
    const { data: stats, error } = await sb().rpc('get_supervisor_dashboard_stats');
    throwIf(error);
    const s = stats as Record<string, number>;
    const siteIds = await data.getMySupervisorJobSiteIds();
    const today = new Date().toISOString().slice(0, 10);

    let todayAttendance: AttendanceLog[] = [];
    let pendingTimesheets: Timesheet[] = [];
    let recentSignedTimesheets: Timesheet[] = [];

    if (siteIds.length > 0) {
      todayAttendance = await data.getSupervisorPortalAttendance({ date: today });
      pendingTimesheets = await data.getSupervisorPortalTimesheets({ pendingOnly: true });
      const all = await data.getSupervisorPortalTimesheets();
      recentSignedTimesheets = all
        .filter((t) => ['SIGNED', 'SENT', 'APPROVED'].includes(t.status))
        .slice(0, 10);
    }

    return {
      stats: {
        assignedJobSites: s.assignedJobSites ?? 0,
        workersAssigned: s.workersAssigned ?? 0,
        clockedInToday: s.clockedInToday ?? 0,
        pendingTimesheets: s.pendingTimesheets ?? 0,
        signedTimesheets: s.signedTimesheets ?? 0,
      },
      todayAttendance,
      pendingTimesheets,
      recentSignedTimesheets,
    };
  },

  async getSupervisorPortalJobSites(): Promise<CustomerJobSite[]> {
    const siteIds = await data.getMySupervisorJobSiteIds();
    if (siteIds.length === 0) return [];
    const { data: rows, error } = await sb()
      .from('job_sites')
      .select(
        '*, customer:customers(id, company_name), assignments:job_assignments(*, employee:employees(id, first_name, last_name, position))',
      )
      .in('id', siteIds)
      .eq('status', 'ACTIVE')
      .order('name');
    throwIf(error);
    return (rows ?? []).map((r) => {
      const site = mapJobSite(r as Record<string, unknown>);
      const assignments = ((r as Record<string, unknown>).assignments as Record<string, unknown>[]) ?? [];
      return {
        ...site,
        assignments: assignments.map((a) => mapAssignment(a)),
      };
    });
  },

  async getSupervisorPortalAttendance(params?: {
    date?: string;
    jobSiteId?: string;
    status?: string;
  }): Promise<AttendanceLog[]> {
    const siteIds = await data.getMySupervisorJobSiteIds();
    if (siteIds.length === 0) return [];
    let q = sb()
      .from('attendance_logs')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name)',
      )
      .in('job_site_id', siteIds)
      .order('clock_in_time', { ascending: false });
    if (params?.jobSiteId) q = q.eq('job_site_id', params.jobSiteId);
    if (params?.status) q = q.eq('status', params.status);
    if (params?.date) {
      q = q
        .gte('clock_in_time', `${params.date}T00:00:00`)
        .lte('clock_in_time', `${params.date}T23:59:59`);
    }
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((r) => mapAttendance(r as Record<string, unknown>));
  },

  async getSupervisorPortalTimesheets(params?: {
    status?: string;
    jobSiteId?: string;
    pendingOnly?: boolean;
  }): Promise<Timesheet[]> {
    const siteIds = await data.getMySupervisorJobSiteIds();
    if (siteIds.length === 0) return [];
    let q = sb()
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .in('job_site_id', siteIds)
      .order('created_at', { ascending: false });
    if (params?.jobSiteId) q = q.eq('job_site_id', params.jobSiteId);
    if (params?.status) q = q.eq('status', params.status);
    const { data: rows, error } = await q;
    throwIf(error);
    let list = (rows ?? []).map((r) => mapTimesheet(r as Record<string, unknown>));
    if (params?.pendingOnly) {
      list = list.filter(
        (t) =>
          ['DRAFT', 'SUBMITTED'].includes(t.status) &&
          !t.signature?.signatureImageUrl,
      );
    }
    return list;
  },

  async getSupervisorHoursReport(params: {
    from: string;
    to: string;
    jobSiteId?: string;
  }): Promise<SupervisorHoursReportRow[]> {
    const { data: rows, error } = await sb().rpc('get_supervisor_hours_report', {
      p_from: params.from,
      p_to: params.to,
      p_job_site_id: params.jobSiteId ?? null,
    });
    throwIf(error);
    const list = (rows ?? []) as Record<string, unknown>[];
    return list.map((r) => ({
      employeeId: r.employee_id as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      jobSiteId: r.job_site_id as string,
      jobSiteName: r.job_site_name as string,
      totalHours: Number(r.total_hours ?? 0),
      timesheetCount: Number(r.timesheet_count ?? 0),
    }));
  },

  async getAdminHoursReport(params: {
    from: string;
    to: string;
    customerId?: string;
    jobSiteId?: string;
  }): Promise<AdminHoursReportRow[]> {
    const { data: rows, error } = await sb().rpc('get_admin_hours_report', {
      p_from: params.from,
      p_to: params.to,
      p_customer_id: params.customerId ?? null,
      p_job_site_id: params.jobSiteId ?? null,
    });
    throwIf(error);
    const list = (rows ?? []) as Record<string, unknown>[];
    return list.map((r) => ({
      employeeId: r.employee_id as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      customerId: r.customer_id as string,
      companyName: r.company_name as string,
      jobSiteId: r.job_site_id as string,
      jobSiteName: r.job_site_name as string,
      totalHours: Number(r.total_hours ?? 0),
      timesheetCount: Number(r.timesheet_count ?? 0),
    }));
  },

  async getAdminPendingSignatures(): Promise<Timesheet[]> {
    const { data: rows, error } = await sb()
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), customer:customers(id, company_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .in('status', ['DRAFT', 'SUBMITTED'])
      .order('created_at', { ascending: false });
    throwIf(error);
    return (rows ?? [])
      .map((r) => mapTimesheet(r as Record<string, unknown>))
      .filter((t) => !t.signature?.signatureImageUrl);
  },

  mapImportBatchResult(raw: Record<string, unknown>): ImportBatchResult {
    return {
      dryRun: Boolean(raw.dryRun),
      pasted: Number(raw.pasted ?? 0),
      created: Number(raw.created ?? 0),
      updated: Number(raw.updated ?? 0),
      skipped: raw.skipped != null ? Number(raw.skipped) : undefined,
      failed: Number(raw.failed ?? 0),
      conflicts: raw.conflicts != null ? Number(raw.conflicts) : undefined,
      results: (raw.results as ImportBatchResult['results']) ?? [],
      runId: (raw.runId as string | null) ?? null,
    };
  },

  async importEmployeesBatch(
    rows: Record<string, unknown>[],
    dryRun = true,
  ): Promise<ImportBatchResult> {
    const { data: result, error } = await sb().rpc('import_employees_batch', {
      p_rows: rows,
      p_dry_run: dryRun,
    });
    throwIf(error);
    return data.mapImportBatchResult(result as Record<string, unknown>);
  },

  async importCustomersBatch(
    rows: Record<string, unknown>[],
    dryRun = true,
  ): Promise<ImportBatchResult> {
    const { data: result, error } = await sb().rpc('import_customers_batch', {
      p_rows: rows,
      p_dry_run: dryRun,
    });
    throwIf(error);
    return data.mapImportBatchResult(result as Record<string, unknown>);
  },

  async importJobSitesBatch(
    rows: Record<string, unknown>[],
    dryRun = true,
    pending?: WorkbookPendingIds,
  ): Promise<ImportBatchResult> {
    const { data: result, error } = await sb().rpc('import_job_sites_batch', {
      p_rows: rows,
      p_dry_run: dryRun,
      p_pending_customer_ids: pending?.pendingCustomerIds ?? [],
    });
    throwIf(error);
    return data.mapImportBatchResult(result as Record<string, unknown>);
  },

  async importAssignmentsBatch(
    rows: Record<string, unknown>[],
    dryRun = true,
    resolutions: AssignmentImportResolution[] = [],
    weekStart?: string,
    weekEnd?: string,
    pending?: WorkbookPendingIds,
  ): Promise<ImportBatchResult> {
    const { data: result, error } = await sb().rpc('import_assignments_batch', {
      p_rows: rows,
      p_dry_run: dryRun,
      p_resolutions: resolutions.map((r) => ({
        row: r.row,
        action: r.action,
        old_end_date: r.oldEndDate,
        new_start_date: r.newStartDate,
      })),
      p_week_start: weekStart ?? null,
      p_week_end: weekEnd ?? null,
      p_pending_employee_ids: pending?.pendingEmployeeIds ?? [],
      p_pending_customer_ids: pending?.pendingCustomerIds ?? [],
      p_pending_job_ids: pending?.pendingJobIds ?? [],
    });
    throwIf(error);
    return data.mapImportBatchResult(result as Record<string, unknown>);
  },

  async getDataImportRuns(params?: {
    importType?: string;
    limit?: number;
  }): Promise<DataImportRun[]> {
    let q = sb()
      .from('data_import_runs')
      .select('*, imported_by:users(id, name, email)')
      .order('imported_at', { ascending: false })
      .limit(params?.limit ?? 50);
    if (params?.importType) q = q.eq('import_type', params.importType);
    const { data: rows, error } = await q;
    throwIf(error);
    return (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const user = r.imported_by as Record<string, unknown> | null;
      return {
        id: r.id as string,
        importType: r.import_type as DataImportRun['importType'],
        importedBy: (r.imported_by as string) ?? null,
        importedAt: r.imported_at as string,
        pastedCount: Number(r.pasted_count ?? 0),
        createdCount: Number(r.created_count ?? 0),
        updatedCount: Number(r.updated_count ?? 0),
        skippedCount: Number(r.skipped_count ?? 0),
        failedCount: Number(r.failed_count ?? 0),
        conflictCount: Number(r.conflict_count ?? 0),
        weekStartDate: (r.week_start_date as string | null) ?? null,
        weekEndDate: (r.week_end_date as string | null) ?? null,
        dryRun: Boolean(r.dry_run),
        summary: (r.summary as Record<string, unknown>) ?? {},
        errorDetails: (r.error_details as unknown[]) ?? [],
        importedByUser: user
          ? { id: user.id as string, name: user.name as string, email: user.email as string }
          : null,
      };
    });
  },

  async getDataImportRun(id: string): Promise<DataImportRun | null> {
    const { data: row, error } = await sb()
      .from('data_import_runs')
      .select('*, imported_by:users(id, name, email)')
      .eq('id', id)
      .maybeSingle();
    throwIf(error);
    if (!row) return null;
    const r = row as Record<string, unknown>;
    const user = r.imported_by as Record<string, unknown> | null;
    return {
      id: r.id as string,
      importType: r.import_type as DataImportRun['importType'],
      importedBy: (r.imported_by as string) ?? null,
      importedAt: r.imported_at as string,
      pastedCount: Number(r.pasted_count ?? 0),
      createdCount: Number(r.created_count ?? 0),
      updatedCount: Number(r.updated_count ?? 0),
      skippedCount: Number(r.skipped_count ?? 0),
      failedCount: Number(r.failed_count ?? 0),
      conflictCount: Number(r.conflict_count ?? 0),
      weekStartDate: (r.week_start_date as string | null) ?? null,
      weekEndDate: (r.week_end_date as string | null) ?? null,
      dryRun: Boolean(r.dry_run),
      summary: (r.summary as Record<string, unknown>) ?? {},
      errorDetails: (r.error_details as unknown[]) ?? [],
      importedByUser: user
        ? { id: user.id as string, name: user.name as string, email: user.email as string }
        : null,
    };
  },

  async getImportReferenceIds(): Promise<{
    employeeIds: string[];
    customerIds: string[];
    jobIds: string[];
  }> {
    const [employeesRes, customersRes, jobsRes] = await Promise.all([
      sb().from('employees').select('master_employee_id'),
      sb().from('customers').select('master_customer_id'),
      sb().from('job_sites').select('master_job_id'),
    ]);
    throwIf(employeesRes.error);
    throwIf(customersRes.error);
    throwIf(jobsRes.error);

    const employeeIds = (employeesRes.data ?? [])
      .map((row) => String((row as { master_employee_id?: string | null }).master_employee_id ?? '').trim())
      .filter(Boolean);
    const customerIds = (customersRes.data ?? [])
      .map((row) => String((row as { master_customer_id?: string | null }).master_customer_id ?? '').trim())
      .filter(Boolean);
    const jobIds = (jobsRes.data ?? [])
      .map((row) => String((row as { master_job_id?: string | null }).master_job_id ?? '').trim())
      .filter(Boolean);

    return { employeeIds, customerIds, jobIds };
  },
};

// Alias for drop-in replacement
export const api = data;
