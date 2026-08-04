import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
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

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "timesheet";
}

function displayTime(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${match[2]} ${suffix}`;
}

function formatHours(value: unknown) {
  const hours = Number(value ?? 0);
  return `${Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0}h`;
}

function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && dates.length < 31) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function loadSignatureImage(pdf: PDFDocument, imageUrl: unknown) {
  const url = String(imageUrl ?? "").trim();
  if (!url) return null;
  try {
    let bytes: Uint8Array;
    let mime = "";
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;,]+);base64,(.+)$/);
      if (!match) return null;
      mime = match[1].toLowerCase();
      bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    } else {
      const response = await fetch(url);
      if (!response.ok) return null;
      mime = response.headers.get("content-type")?.toLowerCase() ?? "";
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (mime.includes("png")) return await pdf.embedPng(bytes);
    if (mime.includes("jpeg") || mime.includes("jpg")) return await pdf.embedJpg(bytes);
  } catch {
    // A missing signature image must not prevent delivery of the timesheet PDF.
  }
  return null;
}

async function loadBrandLogo(pdf: PDFDocument) {
  const webAppUrl = Deno.env.get("WEB_APP_URL")?.replace(/\/$/, "");
  if (!webAppUrl) return null;
  try {
    const response = await fetch(`${webAppUrl}/logo.png`);
    if (!response.ok) return null;
    return await pdf.embedPng(new Uint8Array(await response.arrayBuffer()));
  } catch {
    // Keep PDF delivery working if the public logo cannot be reached temporarily.
    return null;
  }
}

async function createTimesheetPdf(row: any, companyName: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);
  const blue = rgb(0.08, 0.39, 0.82);
  const border = rgb(0.87, 0.90, 0.94);
  const panel = rgb(0.97, 0.98, 0.99);
  const employee = relation(row.employee);
  const jobSite = relation(row.job_site);
  const signature = relation(row.signature);
  const employeeName = `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim();
  const periodStart = row.week_start_date || row.work_date || "";
  const periodEnd = row.week_end_date || row.work_date || "";
  const period = periodStart === periodEnd ? periodStart : `${periodStart} - ${periodEnd}`;
  const entries = [...(row.entries ?? [])].sort((a: any, b: any) =>
    String(a.work_date).localeCompare(String(b.work_date))
  );
  const entriesByDate = new Map(entries.map((entry: any) => [String(entry.work_date), entry]));
  const dates = periodStart && periodEnd ? enumerateDates(periodStart, periodEnd) : entries.map((entry: any) => String(entry.work_date));
  const drawText = (text: unknown, x: number, y: number, size = 10, font = regular, color = dark) =>
    page.drawText(String(text ?? ""), { x, y, size, font, color });
  const label = (text: string, x: number, y: number) => drawText(text.toUpperCase(), x, y, 8, regular, muted);

  const brandLogo = await loadBrandLogo(pdf);
  if (brandLogo) {
    const scale = Math.min(235 / brandLogo.width, 34 / brandLogo.height);
    page.drawImage(brandLogo, {
      x: 36,
      y: 741,
      width: brandLogo.width * scale,
      height: brandLogo.height * scale,
    });
  } else {
    drawText("MC Labor Sources", 36, 752, 19, bold, blue);
  }
  drawText("SIGNED TIMESHEET", 36, 724, 9, bold, muted);

  page.drawRectangle({ x: 36, y: 580, width: 540, height: 132, color: panel, borderColor: border, borderWidth: 1 });
  label("Employee", 50, 688); drawText(employeeName, 50, 671, 11, bold);
  label("Company", 310, 688); drawText(companyName, 310, 671, 11, bold);
  label("Job site", 50, 647); drawText(jobSite?.name ?? "Job site", 50, 630, 11, bold);
  label("Period", 310, 647); drawText(period, 310, 630, 11, bold);
  label("Total hours", 50, 606); drawText(formatHours(row.total_hours), 50, 589, 11, bold, blue);
  label("Status", 310, 606); drawText(String(row.status ?? "SUBMITTED"), 310, 589, 10, bold, rgb(0.62, 0.43, 0.05));

  const tableTop = 555;
  page.drawRectangle({ x: 36, y: 309, width: 540, height: 258, borderColor: border, borderWidth: 1 });
  label("Time entries", 50, tableTop);
  const columns = [50, 192, 282, 382, 532];
  ["Date", "Start", "End", "Entry", "Hours"].forEach((heading, index) =>
    drawText(heading, columns[index], tableTop - 25, 9, bold, muted)
  );
  page.drawLine({ start: { x: 50, y: tableTop - 34 }, end: { x: 562, y: tableTop - 34 }, thickness: 1, color: border });
  dates.slice(0, 7).forEach((date, index) => {
    const entry: any = entriesByDate.get(date);
    const y = tableTop - 58 - index * 29;
    drawText(date, columns[0], y, 9);
    drawText(entry ? displayTime(entry.start_time) : "-", columns[1], y, 9, regular, entry ? dark : muted);
    drawText(entry ? displayTime(entry.end_time) : "-", columns[2], y, 9, regular, entry ? dark : muted);
    drawText(entry ? "Recorded" : "No logged time", columns[3], y, 9, regular, muted);
    drawText(formatHours(entry?.hours), columns[4], y, 9);
    if (index < 6) page.drawLine({ start: { x: 50, y: y - 10 }, end: { x: 562, y: y - 10 }, thickness: 0.5, color: border });
  });

  page.drawRectangle({ x: 36, y: 245, width: 540, height: 48, borderColor: border, borderWidth: 1 });
  label("Foreman", 50, 274); drawText(signature?.foreman_name || "Not signed", 50, 257, 10, bold);
  label("Signed", 310, 274);
  drawText(signature?.signed_at ? new Date(signature.signed_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Not signed", 310, 257, 10, bold);

  page.drawRectangle({ x: 36, y: 91, width: 540, height: 138, borderColor: border, borderWidth: 1 });
  label("Signature", 50, 207);
  const signatureImage = await loadSignatureImage(pdf, signature?.signature_image_url);
  if (signatureImage) {
    const scale = Math.min(440 / signatureImage.width, 85 / signatureImage.height, 1);
    const width = signatureImage.width * scale;
    const height = signatureImage.height * scale;
    page.drawImage(signatureImage, { x: 306 - width / 2, y: 108 + (78 - height) / 2, width, height });
  } else {
    drawText("No drawn signature available", 50, 146, 10, regular, muted);
  }
  drawText("Generated by MC Labor Sources", 36, 58, 8, regular, muted);

  return await pdf.save();
}

function buildWeeklySummaryEmail(rows: any[]) {
  const headings = ["Job", "First", "Last", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "TH", "RH", "OT"];
  const hourText = (value: number) => String(Math.round(value * 100) / 100);
  const weeklyRows = rows.map((row: any) => {
    const employee = relation(row.employee);
    const jobSite = relation(row.job_site);
    const dailyHours = [0, 0, 0, 0, 0, 0, 0];
    (row.entries ?? []).forEach((entry: any) => {
      const date = new Date(`${entry.work_date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return;
      dailyHours[(date.getUTCDay() + 1) % 7] += Number(entry.hours ?? 0);
    });
    const totalHours = Number(row.total_hours ?? 0);
    return {
      job: jobSite?.name ?? "Job site",
      firstName: employee?.first_name ?? "",
      lastName: employee?.last_name ?? "",
      dailyHours,
      totalHours,
      regularHours: Math.min(totalHours, 40),
      overtimeHours: Math.max(totalHours - 40, 0),
    };
  });
  const periodStarts = rows.map((row: any) => row.week_start_date || row.work_date).filter(Boolean).sort();
  const periodEnds = rows.map((row: any) => row.week_end_date || row.work_date).filter(Boolean).sort();
  const periodStart = periodStarts[0] ?? "";
  const periodEnd = periodEnds[periodEnds.length - 1] ?? "";
  const formatDate = (value: string) => value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";
  const plainRows = weeklyRows.map((row) => [
    row.job,
    row.firstName,
    row.lastName,
    ...row.dailyHours.map(hourText),
    hourText(row.totalHours),
    hourText(row.regularHours),
    hourText(row.overtimeHours),
  ].join("\t"));
  const text = [
    "MC Labor Sources - Hours worked",
    `From: ${formatDate(periodStart)}`,
    `To: ${formatDate(periodEnd)}`,
    "",
    headings.join("\t"),
    ...plainRows,
    "",
    `${rows.length} signed timesheet PDF${rows.length === 1 ? " is" : "s are"} attached.`,
  ].join("\n");

  const cell = "padding:7px 8px;border:1px solid #cbd5e1;white-space:nowrap";
  const numberCell = `${cell};text-align:right`;
  const bodyRows = weeklyRows.map((row) => `
    <tr>
      <td style="${cell};font-weight:600">${escapeHtml(row.job)}</td>
      <td style="${cell}">${escapeHtml(row.firstName)}</td>
      <td style="${cell}">${escapeHtml(row.lastName)}</td>
      ${row.dailyHours.map((hours) => `<td style="${numberCell}">${escapeHtml(hourText(hours))}</td>`).join("")}
      <td style="${numberCell};font-weight:700">${escapeHtml(hourText(row.totalHours))}</td>
      <td style="${numberCell};font-weight:700">${escapeHtml(hourText(row.regularHours))}</td>
      <td style="${numberCell};font-weight:700">${escapeHtml(hourText(row.overtimeHours))}</td>
    </tr>
  `).join("");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:1100px;margin:auto">
      <h1 style="margin:0 0 16px;color:#1d4ed8;font-size:26px">MC Labor Sources Timesheets</h1>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700">Hours worked</p>
      <p style="margin:0 0 2px"><strong>From:</strong> ${escapeHtml(formatDate(periodStart))}</p>
      <p style="margin:0 0 18px"><strong>To:</strong> ${escapeHtml(formatDate(periodEnd))}</p>
      <div style="overflow-x:auto">
        <table style="width:100%;min-width:900px;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#050505;color:#ffffff">
            ${headings.map((heading, index) => `<th style="padding:7px 8px;border:1px solid #050505;text-align:${index > 2 ? "right" : "left"}">${heading}</th>`).join("")}
          </tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <p style="margin:18px 0 0;color:#475569">
        The ${rows.length === 1 ? "signed timesheet is" : `${rows.length} signed timesheets are`} attached as ${rows.length === 1 ? "a PDF" : "individual PDF files"}.
      </p>
    </div>
  `;
  return { text, html };
}

async function sendEmail(
  adminClient: any,
  recipientEmail: string,
  subject: string,
  text: string,
  html: string,
  relatedId: string,
  attachments: Array<{ filename: string; content: Uint8Array }>,
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
      attachments,
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
        "id, customer_id, status, is_training, ready_to_send, week_start_date, week_end_date, work_date, total_hours, notes, employee:employees(first_name,last_name), customer:customers(office_email,company_name), job_site:job_sites(name), signature:timesheet_signatures(*), entries:timesheet_entries(work_date,start_time,end_time,hours)",
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
    const invalid = rows.find((row: any) => row.status !== "SUBMITTED");
    if (invalid) {
      return jsonResponse({ error: "Only timesheets submitted to the office can be sent" }, 400);
    }
    const notReady = rows.find((row: any) => !row.ready_to_send);
    if (notReady) {
      return jsonResponse({ error: "Every selected timesheet must be marked ready to send" }, 400);
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
    let text = `Please find the selected timesheets below.\n\n${textSections.join("\n\n")}`;

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
    let html = `
      <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:760px;margin:auto">
        <h1 style="color:#1d4ed8">MC Labor Sources Timesheets</h1>
        <p>Please find ${rows.length === 1 ? "the selected timesheet" : `${rows.length} selected timesheets`} below.</p>
        ${htmlSections}
      </div>
    `;

    const summaryEmail = buildWeeklySummaryEmail(rows);
    text = summaryEmail.text;
    html = summaryEmail.html;

    const attachments = await Promise.all(rows.map(async (row: any, index: number) => {
      const employee = relation(row.employee);
      const employeeName = `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim();
      const period = row.week_start_date || row.work_date || String(index + 1);
      return {
        filename: `${safeFilename(employeeName)}-${safeFilename(period)}-timesheet.pdf`,
        content: await createTimesheetPdf(row, customer.company_name),
      };
    }));

    await sendEmail(adminClient, recipientEmail, subject, text, html, rows[0].id, attachments);

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
