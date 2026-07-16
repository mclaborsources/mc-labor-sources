import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { corsHeaders, getAuthedClient, jsonResponse, loadSmtpSettings } from "../_shared/messaging.ts";

type DeliveryResult = { customer: "sent" | "skipped"; mcLabor: "sent" | "skipped"; pushes: number };

async function sendEmail(
  adminClient: any,
  recipientEmail: string,
  subject: string,
  text: string,
  relatedId: string,
) {
  const settings = await loadSmtpSettings(adminClient);
  if (!settings?.email_enabled) return false;
  const password = Deno.env.get("SMTP_PASS");
  if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_user || !password) {
    throw new Error("SMTP is not fully configured");
  }
  const { data: log } = await adminClient.from("email_delivery_log").insert({
    template: "TIMESHEET_SIGNED",
    recipient_email: recipientEmail,
    subject,
    status: "PENDING",
    related_id: relatedId,
  }).select("id").single();
  try {
    const transport = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      auth: { user: settings.smtp_user, pass: password },
    });
    await transport.sendMail({
      from: `"${settings.smtp_from_name || settings.company_name}" <${settings.smtp_from_email || settings.smtp_user}>`,
      to: recipientEmail,
      subject,
      text,
    });
    if (log?.id) await adminClient.from("email_delivery_log").update({ status: "SENT" }).eq("id", log.id);
    return true;
  } catch (error) {
    if (log?.id) {
      await adminClient.from("email_delivery_log").update({
        status: "FAILED",
        error_message: error instanceof Error ? error.message : String(error),
      }).eq("id", log.id);
    }
    throw error;
  }
}

async function sendPushes(adminClient: any, userIds: string[], title: string, body: string, timesheetId: string) {
  if (!userIds.length) return 0;
  const { data: settings } = await adminClient.from("company_settings").select("push_enabled").limit(1);
  if (!settings?.[0]?.push_enabled) return 0;
  const { data: rows } = await adminClient.from("push_device_tokens").select("expo_push_token").in("user_id", userIds);
  const tokens = [...new Set((rows ?? []).map((row: any) => row.expo_push_token).filter(Boolean))] as string[];
  if (!tokens.length) return 0;
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokens.map((to) => ({ to, sound: "default", title, body, data: { type: "TIMESHEET_SIGNED", id: timesheetId } }))),
  });
  if (!response.ok) throw new Error(`Push delivery failed: ${await response.text()}`);
  return tokens.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await getAuthedClient(req);
    if ("error" in auth && auth.error) return auth.error;
    const { adminClient, caller } = auth;
    const { timesheetId } = await req.json() as { timesheetId?: string };
    if (!timesheetId) return jsonResponse({ error: "timesheetId is required" }, 400);

    const { data: timesheet } = await adminClient.from("timesheets").select(
      "id, employee_id, customer_id, job_site_id, status, customer:customers(office_email, company_name), job_site:job_sites(name), signature:timesheet_signatures(*)",
    ).eq("id", timesheetId).maybeSingle();
    if (!timesheet || timesheet.status !== "SIGNED") return jsonResponse({ error: "Signed timesheet not found" }, 404);

    let authorized = ["SUPER_ADMIN", "ADMIN"].includes(caller.role);
    if (caller.role === "WORKER") authorized = caller.employee_id === timesheet.employee_id;
    if (caller.role === "SUPERVISOR") {
      const { data: site } = await adminClient.from("supervisor_job_sites").select("id")
        .eq("user_id", caller.id).eq("job_site_id", timesheet.job_site_id).maybeSingle();
      authorized = Boolean(site);
    }
    if (!authorized) return jsonResponse({ error: "Insufficient permissions" }, 403);

    const signature = Array.isArray(timesheet.signature) ? timesheet.signature[0] : timesheet.signature;
    if (!signature) return jsonResponse({ error: "Signature not found" }, 404);
    const customer = Array.isArray(timesheet.customer) ? timesheet.customer[0] : timesheet.customer;
    const jobSite = Array.isArray(timesheet.job_site) ? timesheet.job_site[0] : timesheet.job_site;
    const subject = "Timesheet Signed";
    const message = `A timesheet has been signed for ${jobSite?.name || "your job site"} by ${signature.foreman_name}.`;
    const result: DeliveryResult = {
      customer: signature.sent_to_customer_office ? "sent" : "skipped",
      mcLabor: signature.sent_to_mc_labor_office ? "sent" : "skipped",
      pushes: 0,
    };

    const { data: recipients } = await adminClient.from("users").select("id, role")
      .or(`customer_id.eq.${timesheet.customer_id},role.in.(SUPER_ADMIN,ADMIN)`).eq("status", "ACTIVE");
    const recipientIds = [...new Set((recipients ?? []).map((user: any) => user.id))];
    const existingNotifications = await adminClient.from("notifications").select("user_id")
      .eq("title", subject).eq("message", message).in("user_id", recipientIds);
    const alreadyNotified = new Set((existingNotifications.data ?? []).map((row: any) => row.user_id));
    const notificationRows = recipientIds.filter((id) => !alreadyNotified.has(id)).map((userId) => ({
      user_id: userId, employee_id: null, title: subject, message, type: "SYSTEM",
    }));
    if (notificationRows.length) await adminClient.from("notifications").insert(notificationRows);

    try {
      if (!signature.sent_to_customer_office && customer?.office_email) {
        if (await sendEmail(adminClient, customer.office_email, subject, message, timesheetId)) {
          result.customer = "sent";
          await adminClient.from("timesheet_signatures").update({
            sent_to_customer_office: true, customer_delivered_at: new Date().toISOString(), delivery_last_error: null,
          }).eq("timesheet_id", timesheetId);
        }
      }
      const mcLaborEmail = Deno.env.get("MC_LABOR_OFFICE_EMAIL") || "";
      if (!signature.sent_to_mc_labor_office && mcLaborEmail) {
        if (await sendEmail(adminClient, mcLaborEmail, subject, message, timesheetId)) {
          result.mcLabor = "sent";
          await adminClient.from("timesheet_signatures").update({
            sent_to_mc_labor_office: true, mc_labor_delivered_at: new Date().toISOString(), delivery_last_error: null,
          }).eq("timesheet_id", timesheetId);
        }
      }
      result.pushes = await sendPushes(adminClient, recipientIds, subject, message, timesheetId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await adminClient.from("timesheet_signatures").update({ delivery_last_error: detail }).eq("timesheet_id", timesheetId);
      return jsonResponse({ error: detail, partial: result }, 500);
    }
    return jsonResponse({ success: true, ...result });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
