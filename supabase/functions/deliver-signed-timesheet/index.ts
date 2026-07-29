import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import {
  corsHeaders,
  getAuthedClient,
  jsonResponse,
  loadSmtpSettings,
} from "../_shared/messaging.ts";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function relation(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function sendEmail(
  adminClient: any,
  recipientEmail: string,
  subject: string,
  text: string,
  html: string,
  relatedId: string,
) {
  const settings = await loadSmtpSettings(adminClient);
  if (!settings?.email_enabled) throw new Error("Email delivery is disabled in Settings");
  const password = Deno.env.get("SMTP_PASS");
  if (!settings.smtp_host || !settings.smtp_port || !settings.smtp_user || !password) {
    throw new Error("SMTP is not fully configured");
  }

  const { data: log } = await adminClient
    .from("email_delivery_log")
    .insert({
      template: "TIMESHEET_CUSTOMER_BATCH",
      recipient_email: recipientEmail,
      subject,
      status: "PENDING",
      related_id: relatedId,
    })
    .select("id")
    .single();

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
      html,
    });
    if (log?.id) {
      await adminClient.from("email_delivery_log").update({ status: "SENT" }).eq("id", log.id);
    }
  } catch (error) {
    if (log?.id) {
      await adminClient
        .from("email_delivery_log")
        .update({
          status: "FAILED",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", log.id);
    }
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await getAuthedClient(req);
    if ("error" in auth && auth.error) return auth.error;
    const { adminClient, caller } = auth;
    if (!["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const body = await req.json() as { timesheetId?: string; timesheetIds?: string[] };
    const ids = [
      ...new Set(
        (body.timesheetIds?.length ? body.timesheetIds : [body.timesheetId])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!ids.length) return jsonResponse({ error: "Select at least one timesheet" }, 400);
    if (ids.length > 50) return jsonResponse({ error: "A maximum of 50 timesheets can be sent at once" }, 400);

    const { data: rows, error: queryError } = await adminClient
      .from("timesheets")
      .select(
        "id, customer_id, status, is_training, week_start_date, week_end_date, work_date, total_hours, notes, employee:employees(first_name,last_name), customer:customers(office_email,company_name), job_site:job_sites(name), signature:timesheet_signatures(*), entries:timesheet_entries(work_date,start_time,end_time,hours)",
      )
      .in("id", ids);
    if (queryError) throw queryError;
    if (!rows || rows.length !== ids.length) {
      return jsonResponse({ error: "One or more timesheets could not be found" }, 404);
    }
    if (rows.some((row: any) => row.is_training)) {
      return jsonResponse({ error: "Training timesheets cannot be sent to customers" }, 400);
    }

    const customerIds = new Set(rows.map((row: any) => row.customer_id));
    if (customerIds.size !== 1) {
      return jsonResponse({ error: "All selected timesheets must belong to the same customer" }, 400);
    }
    const invalid = rows.find((row: any) => !["SIGNED", "SUBMITTED"].includes(row.status));
    if (invalid) {
      return jsonResponse({ error: "Only signed or submitted timesheets can be sent" }, 400);
    }

    const customer = relation(rows[0].customer);
    const recipientEmail = customer?.office_email?.trim();
    if (!recipientEmail) {
      return jsonResponse({ error: "This customer does not have an office email address" }, 400);
    }

    const subject = `${customer.company_name} Timesheets (${rows.length})`;
    const textSections = rows.map((row: any) => {
      const employee = relation(row.employee);
      const jobSite = relation(row.job_site);
      const employeeName = `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim();
      const period = row.week_start_date && row.week_end_date
        ? `${row.week_start_date} - ${row.week_end_date}`
        : row.work_date ?? "";
      const entries = [...(row.entries ?? [])].sort((a: any, b: any) =>
        String(a.work_date).localeCompare(String(b.work_date))
      );
      return [
        `${employeeName} - ${jobSite?.name ?? "Job site"}`,
        `Period: ${period}`,
        ...entries.map((entry: any) => `${entry.work_date}: ${entry.hours} hours`),
        `Total: ${row.total_hours} hours`,
      ].join("\n");
    });
    const text = `Please find the selected timesheets below.\n\n${textSections.join("\n\n")}`;

    const htmlSections = rows.map((row: any) => {
      const employee = relation(row.employee);
      const jobSite = relation(row.job_site);
      const employeeName = `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim();
      const signature = relation(row.signature);
      const period = row.week_start_date && row.week_end_date
        ? `${row.week_start_date} – ${row.week_end_date}`
        : row.work_date ?? "";
      const entries = [...(row.entries ?? [])].sort((a: any, b: any) =>
        String(a.work_date).localeCompare(String(b.work_date))
      );
      const entryRows = entries.map((entry: any) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(entry.work_date)}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(entry.start_time || "—")}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(entry.end_time || "—")}</td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${escapeHtml(entry.hours)}h</td>
        </tr>
      `).join("");
      return `
        <section style="margin:0 0 24px;padding:18px;border:1px solid #dbeafe;border-radius:12px">
          <h2 style="margin:0 0 6px;color:#0f172a;font-size:18px">${escapeHtml(employeeName)}</h2>
          <p style="margin:0 0 14px;color:#475569">${escapeHtml(jobSite?.name ?? "Job site")} · ${escapeHtml(period)}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:8px;text-align:left">Date</th>
              <th style="padding:8px;text-align:left">Start</th>
              <th style="padding:8px;text-align:left">End</th>
              <th style="padding:8px;text-align:right">Hours</th>
            </tr></thead>
            <tbody>${entryRows || '<tr><td colspan="4" style="padding:8px">No daily entries</td></tr>'}</tbody>
          </table>
          <p style="margin:14px 0 0;font-weight:700;color:#1d4ed8">Total: ${escapeHtml(row.total_hours)} hours</p>
          <p style="margin:6px 0 0;color:#64748b">Foreman: ${escapeHtml(signature?.foreman_name || "Office verified")}</p>
        </section>
      `;
    }).join("");
    const html = `
      <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px;margin:auto">
        <h1 style="color:#1d4ed8">MC Labor Sources Timesheets</h1>
        <p>Please find ${rows.length === 1 ? "the selected timesheet" : `${rows.length} selected timesheets`} below.</p>
        ${htmlSections}
      </div>
    `;

    await sendEmail(adminClient, recipientEmail, subject, text, html, rows[0].id);

    const sentAt = new Date().toISOString();
    const { data: deliveryBatch, error: batchError } = await adminClient
      .from("timesheet_delivery_batches")
      .insert({
        customer_id: rows[0].customer_id,
        recipient_email: recipientEmail,
        subject,
        sent_by_user_id: caller.id,
        sent_at: sentAt,
        timesheet_count: rows.length,
      })
      .select("id")
      .single();
    if (batchError || !deliveryBatch) {
      throw batchError ?? new Error("Failed to record timesheet delivery");
    }
    const { error: itemsError } = await adminClient
      .from("timesheet_delivery_items")
      .insert(ids.map((timesheetId) => ({
        batch_id: deliveryBatch.id,
        timesheet_id: timesheetId,
      })));
    if (itemsError) throw itemsError;

    const { error: statusError } = await adminClient
      .from("timesheets")
      .update({ status: "SENT", updated_at: sentAt })
      .in("id", ids);
    if (statusError) throw statusError;
    await adminClient
      .from("timesheet_signatures")
      .update({
        sent_to_customer_office: true,
        customer_delivered_at: sentAt,
        delivery_last_error: null,
      })
      .in("timesheet_id", ids);

    return jsonResponse({
      success: true,
      customer: customer.company_name,
      recipientEmail,
      timesheetsSent: rows.length,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
