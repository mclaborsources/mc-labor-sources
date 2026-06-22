import { supabase } from './supabase';
import { clockInSchema, clockOutSchema } from '@mc-labor/shared';
import { dataUrlToUint8Array } from './signature-image';

export class MobileDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileDataError';
  }
}

function throwIf(error: { message: string } | null) {
  if (error) throw new MobileDataError(error.message);
}

export interface MobileUser {
  id: string;
  name: string;
  email: string;
  role: string;
  customerId: string | null;
  employeeId: string | null;
}

export async function getMe(): Promise<MobileUser> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user) throw new MobileDataError('Not authenticated');
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', session.session.user.id)
    .single();
  throwIf(error);
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    customerId: data.customer_id,
    employeeId: data.employee_id,
  };
}

function mapAssignment(row: Record<string, unknown>) {
  const jobSite = row.job_site as Record<string, unknown> | null;
  const customer = row.customer as Record<string, unknown> | null;
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    customerId: row.customer_id as string,
    jobSiteId: row.job_site_id as string,
    assignedDate: row.assigned_date as string,
    startTime: (row.start_time as string) ?? null,
    endTime: (row.end_time as string) ?? null,
    status: row.status as string,
    notes: (row.notes as string) ?? null,
    jobSite: jobSite
      ? {
          id: jobSite.id as string,
          name: jobSite.name as string,
          address: (jobSite.address as string) ?? '',
        }
      : undefined,
    customer: customer
      ? { id: customer.id as string, companyName: customer.company_name as string }
      : undefined,
  };
}

function mapJobOrder(row: Record<string, unknown>) {
  const jobSite = row.job_site as Record<string, unknown> | null;
  return {
    id: row.id as string,
    orderNumber: row.order_number as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    startDate: row.start_date as string,
    startTime: (row.start_time as string) ?? null,
    instructions: (row.instructions as string) ?? null,
    safetyNotes: (row.safety_notes as string) ?? null,
    status: row.status as string,
    sentAt: (row.sent_at as string) ?? null,
    acknowledgedAt: (row.acknowledged_at as string) ?? null,
    jobSite: jobSite ? { id: jobSite.id as string, name: jobSite.name as string } : undefined,
  };
}

function mapTimesheet(row: Record<string, unknown>) {
  const jobSite = row.job_site as Record<string, unknown> | null;
  return {
    id: row.id as string,
    totalHours: row.total_hours as string | number,
    status: row.status as string,
    workDate: (row.work_date as string) ?? null,
    weekStartDate: (row.week_start_date as string) ?? null,
    weekEndDate: (row.week_end_date as string) ?? null,
    jobSite: jobSite ? { name: jobSite.name as string } : undefined,
  };
}

function mapSupervisorTimesheet(row: Record<string, unknown>) {
  const jobSite = row.job_site as Record<string, unknown> | null;
  const employee = row.employee as Record<string, unknown> | null;
  const sigRows = row.signature as Record<string, unknown>[] | Record<string, unknown> | null;
  const signature = Array.isArray(sigRows) ? sigRows[0] : sigRows;
  return {
    id: row.id as string,
    totalHours: row.total_hours as string | number,
    status: row.status as string,
    workDate: (row.work_date as string) ?? null,
    weekStartDate: (row.week_start_date as string) ?? null,
    weekEndDate: (row.week_end_date as string) ?? null,
    employee: employee
      ? {
          firstName: employee.first_name as string,
          lastName: employee.last_name as string,
        }
      : undefined,
    jobSite: jobSite ? { name: jobSite.name as string } : undefined,
  };
}

async function uploadSignatureDataUrl(dataUrl: string, timesheetId: string): Promise<string> {
  const path = `timesheets/timesheet-${timesheetId}-${Date.now()}.png`;
  const bytes = dataUrlToUint8Array(dataUrl);
  const { error } = await supabase.storage.from('signatures').upload(path, bytes, {
    contentType: 'image/png',
    upsert: false,
  });
  throwIf(error);
  const { data } = supabase.storage.from('signatures').getPublicUrl(path);
  return data.publicUrl;
}

function mapNotification(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    message: row.message as string,
    type: row.type as string,
    readAt: (row.read_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export const mobileApi = {
  getMe,
  getAssignments: async () => {
    const me = await getMe();
    if (!me.employeeId) return [];
    const { data, error } = await supabase
      .from('job_assignments')
      .select(
        '*, job_site:job_sites(id, name, address), customer:customers(id, company_name)',
      )
      .eq('employee_id', me.employeeId)
      .order('assigned_date', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => mapAssignment(row as Record<string, unknown>));
  },
  getAssignment: async (id: string) => {
    const { data, error } = await supabase
      .from('job_assignments')
      .select(
        '*, job_site:job_sites(id, name, address), customer:customers(id, company_name)',
      )
      .eq('id', id)
      .single();
    throwIf(error);
    return mapAssignment(data as Record<string, unknown>);
  },
  getActiveClockIn: async () => {
    const me = await getMe();
    if (!me.employeeId) return null;
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*, job_site:job_sites(id, name)')
      .eq('employee_id', me.employeeId)
      .eq('status', 'CLOCKED_IN')
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIf(error);
    if (!data) return null;
    const jobSite = data.job_site as Record<string, unknown> | null;
    return {
      id: data.id as string,
      clockInTime: data.clock_in_time as string,
      jobSiteId: data.job_site_id as string,
      customerId: data.customer_id as string,
      assignmentId: (data.assignment_id as string) ?? null,
      jobSiteName: jobSite?.name as string | undefined,
    };
  },
  clockIn: async (payload: {
    customerId: string;
    jobSiteId: string;
    assignmentId?: string;
    clockInLatitude?: number;
    clockInLongitude?: number;
    clockInLocationLabel?: string | null;
  }) => {
    const me = await getMe();
    if (!me.employeeId) throw new MobileDataError('Worker profile required');
    clockInSchema.parse({
      employeeId: me.employeeId,
      customerId: payload.customerId,
      jobSiteId: payload.jobSiteId,
      assignmentId: payload.assignmentId,
      clockInLatitude: payload.clockInLatitude,
      clockInLongitude: payload.clockInLongitude,
    });
    const { data, error } = await supabase
      .from('attendance_logs')
      .insert({
        employee_id: me.employeeId,
        customer_id: payload.customerId,
        job_site_id: payload.jobSiteId,
        assignment_id: payload.assignmentId ?? null,
        clock_in_time: new Date().toISOString(),
        clock_in_latitude: payload.clockInLatitude ?? null,
        clock_in_longitude: payload.clockInLongitude ?? null,
        clock_in_location_label: payload.clockInLocationLabel ?? null,
        status: 'CLOCKED_IN',
      })
      .select()
      .single();
    throwIf(error);
    return data;
  },
  clockOut: async (payload: {
    attendanceId: string;
    clockOutLatitude?: number;
    clockOutLongitude?: number;
    clockOutLocationLabel?: string | null;
  }) => {
    clockOutSchema.parse({
      attendanceLogId: payload.attendanceId,
      clockOutLatitude: payload.clockOutLatitude,
      clockOutLongitude: payload.clockOutLongitude,
    });
    const { data: existing, error: fetchError } = await supabase
      .from('attendance_logs')
      .select('clock_in_time')
      .eq('id', payload.attendanceId)
      .single();
    throwIf(fetchError);
    if (!existing) throw new Error('Attendance record not found');
    const now = new Date();
    const clockIn = new Date(existing.clock_in_time as string);
    const totalHours = Math.round(((now.getTime() - clockIn.getTime()) / 3600000) * 100) / 100;
    const { data, error } = await supabase
      .from('attendance_logs')
      .update({
        clock_out_time: now.toISOString(),
        clock_out_latitude: payload.clockOutLatitude ?? null,
        clock_out_longitude: payload.clockOutLongitude ?? null,
        clock_out_location_label: payload.clockOutLocationLabel ?? null,
        total_hours: totalHours,
        status: 'CLOCKED_OUT',
        updated_at: now.toISOString(),
      })
      .eq('id', payload.attendanceId)
      .select()
      .single();
    throwIf(error);
    const { error: rpcError } = await supabase.rpc('upsert_daily_timesheet_from_attendance', {
      p_attendance_log_id: payload.attendanceId,
    });
    throwIf(rpcError);
    return data;
  },
  getJobOrders: async () => {
    const me = await getMe();
    if (!me.employeeId) return [];
    const { data, error } = await supabase
      .from('job_orders')
      .select('*, job_site:job_sites(id, name)')
      .eq('employee_id', me.employeeId)
      .order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => mapJobOrder(row as Record<string, unknown>));
  },
  getJobOrder: async (id: string) => {
    const { data, error } = await supabase
      .from('job_orders')
      .select('*, job_site:job_sites(id, name)')
      .eq('id', id)
      .single();
    throwIf(error);
    return mapJobOrder(data as Record<string, unknown>);
  },
  acknowledgeJobOrder: async (id: string) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('job_orders')
      .update({ status: 'ACKNOWLEDGED', acknowledged_at: now, updated_at: now })
      .eq('id', id)
      .select('*, job_site:job_sites(id, name)')
      .single();
    throwIf(error);
    return mapJobOrder(data as Record<string, unknown>);
  },
  getSafetyBulletins: async () => {
    const { data, error } = await supabase
      .from('safety_bulletins')
      .select('*, job_site:job_sites(id, name)')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      message: row.message as string,
      fileUrl: (row.file_url as string) ?? null,
      sentAt: row.sent_at as string,
      jobSite: row.job_site
        ? { name: (row.job_site as Record<string, unknown>).name as string }
        : undefined,
    }));
  },
  getTimesheets: async () => {
    const me = await getMe();
    if (!me.employeeId) return [];
    const { data, error } = await supabase
      .from('timesheets')
      .select('*, job_site:job_sites(id, name)')
      .eq('employee_id', me.employeeId)
      .order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => mapTimesheet(row as Record<string, unknown>));
  },
  getTimesheet: async (id: string) => {
    const { data, error } = await supabase
      .from('timesheets')
      .select('*, job_site:job_sites(id, name), entries:timesheet_entries(*)')
      .eq('id', id)
      .single();
    throwIf(error);
    const jobSite = data.job_site as Record<string, unknown> | null;
    const entries = (data.entries as Record<string, unknown>[] | null) ?? [];
    return {
      id: data.id as string,
      totalHours: data.total_hours as string | number,
      status: data.status as string,
      workDate: (data.work_date as string) ?? null,
      weekStartDate: (data.week_start_date as string) ?? null,
      weekEndDate: (data.week_end_date as string) ?? null,
      notes: (data.notes as string) ?? null,
      jobSite: jobSite ? { name: jobSite.name as string } : undefined,
      entries: entries.map((e) => ({
        id: e.id as string,
        workDate: e.work_date as string,
        startTime: e.start_time as string,
        endTime: e.end_time as string,
        hours: e.hours as string | number,
        breakMinutes: e.break_minutes as number,
        notes: (e.notes as string) ?? null,
      })),
    };
  },
  getSupervisorTimesheets: async (params?: { pendingOnly?: boolean }) => {
    let q = supabase
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), job_site:job_sites(id, name), signature:timesheet_signatures(*)',
      )
      .order('created_at', { ascending: false });
    const { data, error } = await q;
    throwIf(error);
    let rows = data ?? [];
    if (params?.pendingOnly) {
      rows = rows.filter((row) => {
        const status = row.status as string;
        const sig = row.signature as Record<string, unknown>[] | Record<string, unknown> | null;
        const hasSig = Array.isArray(sig) ? sig.length > 0 : !!sig;
        return (status === 'DRAFT' || status === 'SUBMITTED') && !hasSig;
      });
    }
    return rows.map((row) => mapSupervisorTimesheet(row as Record<string, unknown>));
  },
  getSupervisorTimesheet: async (id: string) => {
    const { data, error } = await supabase
      .from('timesheets')
      .select(
        '*, employee:employees(id, first_name, last_name), job_site:job_sites(id, name), entries:timesheet_entries(*), signature:timesheet_signatures(*)',
      )
      .eq('id', id)
      .single();
    throwIf(error);
    const jobSite = data.job_site as Record<string, unknown> | null;
    const employee = data.employee as Record<string, unknown> | null;
    const entries = (data.entries as Record<string, unknown>[] | null) ?? [];
    const sigRows = data.signature as Record<string, unknown>[] | Record<string, unknown> | null;
    const signature = Array.isArray(sigRows) ? sigRows[0] : sigRows;
    return {
      id: data.id as string,
      totalHours: data.total_hours as string | number,
      status: data.status as string,
      workDate: (data.work_date as string) ?? null,
      weekStartDate: (data.week_start_date as string) ?? null,
      weekEndDate: (data.week_end_date as string) ?? null,
      notes: (data.notes as string) ?? null,
      employee: employee
        ? {
            firstName: employee.first_name as string,
            lastName: employee.last_name as string,
          }
        : undefined,
      jobSite: jobSite ? { name: jobSite.name as string } : undefined,
      signature: signature
        ? {
            foremanName: signature.foreman_name as string,
            foremanEmail: (signature.foreman_email as string) ?? null,
            signatureImageUrl: (signature.signature_image_url as string) ?? null,
          }
        : undefined,
      entries: entries.map((e) => ({
        id: e.id as string,
        workDate: e.work_date as string,
        startTime: e.start_time as string,
        endTime: e.end_time as string,
        hours: e.hours as string | number,
        breakMinutes: e.break_minutes as number,
        notes: (e.notes as string) ?? null,
      })),
    };
  },
  signSupervisorTimesheet: async (
    id: string,
    payload: { foremanName: string; foremanEmail?: string; signatureDataUrl: string },
  ) => {
    let imageUrl = payload.signatureDataUrl;
    if (imageUrl.startsWith('data:')) {
      imageUrl = await uploadSignatureDataUrl(imageUrl, id);
    }
    const { error } = await supabase.rpc('sign_timesheet', {
      p_timesheet_id: id,
      p_foreman_name: payload.foremanName,
      p_foreman_email: payload.foremanEmail ?? '',
      p_signature_image_url: imageUrl,
    });
    throwIf(error);
    return mobileApi.getSupervisorTimesheet(id);
  },
  getNotifications: async () => {
    const me = await getMe();
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
    if (me.employeeId) {
      q = q.or(`user_id.eq.${me.id},employee_id.eq.${me.employeeId}`);
    } else {
      q = q.eq('user_id', me.id);
    }
    const { data, error } = await q;
    throwIf(error);
    return (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
  },
  markNotificationRead: async (id: string) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('id', id)
      .select('*')
      .single();
    throwIf(error);
    return mapNotification(data as Record<string, unknown>);
  },
};

export { signIn } from './supabase';
