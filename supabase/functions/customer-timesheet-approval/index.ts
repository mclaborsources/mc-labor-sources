import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/messaging.ts";

function relation(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatBatch(batch: any) {
  const customer = relation(batch.customer);
  return {
    customerName: customer?.company_name ?? "Customer",
    recipientEmail: batch.recipient_email,
    sentAt: batch.sent_at,
    expiresAt: batch.approval_expires_at,
    timesheets: (batch.items ?? []).map((item: any) => {
      const timesheet = relation(item.timesheet);
      const employee = relation(timesheet?.employee);
      const jobSite = relation(timesheet?.job_site);
      return {
        id: timesheet?.id,
        employeeName: `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim(),
        jobSiteName: jobSite?.name ?? "Job site",
        workDate: timesheet?.work_date,
        weekStartDate: timesheet?.week_start_date,
        weekEndDate: timesheet?.week_end_date,
        totalHours: Number(timesheet?.total_hours ?? 0),
        approvedAt: item.customer_approved_at,
        reviewRequestedAt: item.review_requested_at,
        reviewComment: item.review_comment,
        entries: (timesheet?.entries ?? [])
          .map((entry: any) => ({
            workDate: entry.work_date,
            hours: Number(entry.hours ?? 0),
          }))
          .sort((left: any, right: any) => left.workDate.localeCompare(right.workDate)),
      };
    }),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as {
      action?: "load" | "approve" | "approve_all" | "request_review";
      token?: string;
      timesheetId?: string;
      comment?: string;
    };
    const token = body.token?.trim() ?? "";
    if (token.length < 32) return jsonResponse({ error: "This approval link is invalid." }, 400);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const tokenHash = await sha256(token);
    const { data: batch, error: batchError } = await adminClient
      .from("timesheet_delivery_batches")
      .select(
        "id, recipient_email, sent_at, approval_expires_at, customer:customers(company_name), items:timesheet_delivery_items(timesheet_id, customer_approved_at, review_requested_at, review_comment, timesheet:timesheets(id, work_date, week_start_date, week_end_date, total_hours, employee:employees(first_name,last_name), job_site:job_sites(name), entries:timesheet_entries(work_date,hours)))",
      )
      .eq("approval_token_hash", tokenHash)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) return jsonResponse({ error: "This approval link is invalid." }, 404);
    if (!batch.approval_expires_at || new Date(batch.approval_expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "This approval link has expired. Please ask MC Labor Sources to resend the timesheets." }, 410);
    }

    if (body.action === "approve_all") {
      const approvableItems = (batch.items ?? []).filter(
        (item: any) => !item.customer_approved_at && !item.review_requested_at,
      );
      if (approvableItems.length > 0) {
        const decidedAt = new Date().toISOString();
        const timesheetIds = approvableItems.map((item: any) => item.timesheet_id);
        const { error: approvalError } = await adminClient
          .from("timesheet_delivery_items")
          .update({ customer_approved_at: decidedAt })
          .eq("batch_id", batch.id)
          .in("timesheet_id", timesheetIds)
          .is("customer_approved_at", null)
          .is("review_requested_at", null);
        if (approvalError) throw approvalError;
        const { error: timesheetError } = await adminClient.from("timesheets")
          .update({ status: "APPROVED", updated_at: decidedAt })
          .in("id", timesheetIds);
        if (timesheetError) throw timesheetError;
        approvableItems.forEach((item: any) => {
          item.customer_approved_at = decidedAt;
        });
      }
    } else if (body.action === "approve" || body.action === "request_review") {
      if (!body.timesheetId) return jsonResponse({ error: "Choose a timesheet to approve." }, 400);
      const belongsToBatch = (batch.items ?? []).some(
        (item: any) => item.timesheet_id === body.timesheetId,
      );
      if (!belongsToBatch) return jsonResponse({ error: "Timesheet not found in this delivery." }, 404);
      const item = (batch.items ?? []).find((candidate: any) => candidate.timesheet_id === body.timesheetId);
      if (item?.customer_approved_at || item?.review_requested_at) {
        return jsonResponse({ error: "A decision has already been recorded for this timesheet." }, 409);
      }
      const decidedAt = new Date().toISOString();
      const decision = body.action === "approve"
        ? { customer_approved_at: decidedAt }
        : { review_requested_at: decidedAt, review_comment: body.comment?.trim().slice(0, 2000) || null };
      const { error: approvalError } = await adminClient
        .from("timesheet_delivery_items")
        .update(decision)
        .eq("batch_id", batch.id)
        .eq("timesheet_id", body.timesheetId)
        .is("customer_approved_at", null);
      if (approvalError) throw approvalError;
      if (body.action === "approve") {
        item.customer_approved_at = decidedAt;
        const { error: timesheetError } = await adminClient.from("timesheets")
          .update({ status: "APPROVED", updated_at: decidedAt })
          .eq("id", body.timesheetId);
        if (timesheetError) throw timesheetError;
      } else {
        item.review_requested_at = decidedAt;
        item.review_comment = decision.review_comment;
        const { error: timesheetError } = await adminClient.from("timesheets")
          .update({ status: "SUBMITTED", ready_to_send: false, updated_at: decidedAt })
          .eq("id", body.timesheetId);
        if (timesheetError) throw timesheetError;
      }
    }

    return jsonResponse(formatBatch(batch));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
