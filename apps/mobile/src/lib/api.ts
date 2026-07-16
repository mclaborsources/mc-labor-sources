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

export interface MessageContact {
  contactUserId: string;
  contactName: string;
  jobSiteId: string;
  jobSiteName: string;
  conversationId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
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
  getMessageContacts: async (): Promise<MessageContact[]> => {
    const { data, error } = await supabase.rpc('list_message_contacts');
    throwIf(error);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      contactUserId: row.contact_user_id as string,
      contactName: row.contact_name as string,
      jobSiteId: row.job_site_id as string,
      jobSiteName: row.job_site_name as string,
      conversationId: (row.conversation_id as string) ?? null,
      lastMessage: (row.last_message as string) ?? null,
      lastMessageAt: (row.last_message_at as string) ?? null,
      unreadCount: Number(row.unread_count ?? 0),
    }));
  },
  openMessageConversation: async (contactUserId: string, jobSiteId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('open_message_conversation', {
      p_contact_user_id: contactUserId,
      p_job_site_id: jobSiteId,
    });
    throwIf(error);
    return data as string;
  },
  getConversationMessages: async (conversationId: string): Promise<ConversationMessage[]> => {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    throwIf(error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      conversationId: row.conversation_id as string,
      senderUserId: row.sender_user_id as string,
      body: row.body as string,
      readAt: (row.read_at as string) ?? null,
      createdAt: row.created_at as string,
    }));
  },
  sendConversationMessage: async (conversationId: string, body: string): Promise<void> => {
    const me = await getMe();
    const message = body.trim();
    if (!message || message.length > 2000) throw new MobileDataError('Message must be between 1 and 2,000 characters');
    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      sender_user_id: me.id,
      body: message,
    });
    throwIf(error);
    // Message persistence is primary; push delivery is best-effort.
    void supabase.functions.invoke('send-push-notification', {
      body: {
        conversationId,
        title: `New message from ${me.name}`,
        body: message.length > 140 ? `${message.slice(0, 137)}…` : message,
        data: { type: 'MESSAGE', id: conversationId },
      },
    }).catch(() => undefined);
  },
  markConversationRead: async (conversationId: string): Promise<void> => {
    const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    throwIf(error);
  },
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
  respondToAssignment: async (id: string, response: 'ACCEPTED' | 'DECLINED') => {
    const { data, error } = await supabase.rpc('respond_to_assignment', {
      p_assignment_id: id,
      p_response: response,
    });
    throwIf(error);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new MobileDataError('Assignment response was not saved');
    return mapAssignment(row as Record<string, unknown>);
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
    const { data: timesheetId, error: rpcError } = await supabase.rpc('upsert_daily_timesheet_from_attendance', {
      p_attendance_log_id: payload.attendanceId,
    });
    throwIf(rpcError);
    return { attendance: data, timesheetId: timesheetId as string };
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
      .select('*, job_site:job_sites(id, name), acknowledgements:safety_bulletin_acknowledgements(acknowledged_at)')
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
      acknowledgedAt: Array.isArray(row.acknowledgements) && row.acknowledgements.length
        ? (row.acknowledgements[0] as Record<string, unknown>).acknowledged_at as string
        : null,
    }));
  },
  acknowledgeSafetyBulletin: async (bulletinId: string) => {
    const me = await getMe();
    if (!me.employeeId) throw new MobileDataError('Worker profile required');
    const { error } = await supabase.from('safety_bulletin_acknowledgements').upsert(
      { bulletin_id: bulletinId, employee_id: me.employeeId },
      { onConflict: 'bulletin_id,employee_id', ignoreDuplicates: true },
    );
    throwIf(error);
  },
  getDailyTasks: async () => {
    const { data, error } = await supabase.from('daily_tasks')
      .select('*, job_site:job_sites(id,name), employee:employees(id,first_name,last_name)')
      .order('task_date', { ascending: false }).order('created_at', { ascending: false });
    throwIf(error);
    return (data ?? []).map((row) => ({
      id: row.id as string, taskDate: row.task_date as string, title: row.title as string,
      description: (row.description as string) ?? null, status: row.status as string,
      completionNotes: (row.completion_notes as string) ?? null,
      jobSite: row.job_site as { id: string; name: string },
      employee: row.employee ? { id: (row.employee as any).id as string, name: `${(row.employee as any).first_name} ${(row.employee as any).last_name}` } : null,
    }));
  },
  createDailyTask: async (payload: { workerUserId: string; jobSiteId: string; taskDate: string; title: string; description?: string }) => {
    const { error } = await supabase.rpc('create_daily_task', { p_worker_user_id: payload.workerUserId, p_job_site_id: payload.jobSiteId, p_task_date: payload.taskDate, p_title: payload.title, p_description: payload.description ?? '' });
    throwIf(error);
  },
  updateDailyTaskStatus: async (id: string, status: string, completionNotes?: string) => {
    const { error } = await supabase.rpc('update_daily_task_status', { p_task_id: id, p_status: status, p_completion_notes: completionNotes ?? '' });
    throwIf(error);
  },
  getSafetyAcknowledgementReport: async (): Promise<Array<{
    bulletinId: string;
    bulletinTitle: string;
    employeeName: string;
    jobSiteName: string;
    acknowledgedAt: string | null;
  }>> => {
    const { data, error } = await supabase.rpc('list_safety_acknowledgement_report');
    throwIf(error);
    return (data ?? []).map((row: Record<string, unknown>) => ({ bulletinId: row.bulletin_id as string, bulletinTitle: row.bulletin_title as string, employeeName: row.employee_name as string, jobSiteName: row.job_site_name as string, acknowledgedAt: (row.acknowledged_at as string) ?? null }));
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
    const timesheet = await mobileApi.getSupervisorTimesheet(id);
    try {
      const delivery = await mobileApi.deliverSignedTimesheet(id);
      const deliveryError = delivery.customer !== 'sent' || delivery.mcLabor !== 'sent'
        ? 'One or more office emails were skipped. Check SMTP and office email settings, then retry.'
        : null;
      return { timesheet, delivery, deliveryError };
    } catch (error) {
      return {
        timesheet,
        delivery: null,
        deliveryError: error instanceof Error ? error.message : 'Office delivery failed',
      };
    }
  },

  deliverSignedTimesheet: async (id: string) => {
    const { data, error } = await supabase.functions.invoke('deliver-signed-timesheet', {
      body: { timesheetId: id },
    });
    throwIf(error);
    if (data?.error) throw new MobileDataError(data.error as string);
    return data as {
      success: boolean;
      customer: 'sent' | 'skipped';
      mcLabor: 'sent' | 'skipped';
      pushes: number;
    };
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
