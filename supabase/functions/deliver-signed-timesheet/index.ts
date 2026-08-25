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

function normalizedWebAppUrl() {
  const configured = Deno.env.get("WEB_APP_URL")?.trim().replace(/\/$/, "");
  if (!configured) throw new Error("WEB_APP_URL is required for customer approval links");
  const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("WEB_APP_URL must use HTTPS");
  }
  return parsed.toString().replace(/\/$/, "");
}

function formatHours(value: unknown) {
  const hours = Number(value ?? 0);
  return `${Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0}h`;
}

function createApprovalToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  let webAppUrl: string;
  try { webAppUrl = normalizedWebAppUrl(); } catch { return null; }
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
  const assignment = relation(row.assignment);
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
  const sanitizePdfText = (value: unknown) => {
    const normalized = String(value ?? "")
      .replaceAll("\uFFFC", " ")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replaceAll("\u2026", "...")
      .replace(/[\u2013\u2014]/g, "-")
      .replaceAll("\u00A0", " ");
    let safe = "";
    for (const character of normalized) {
      try {
        regular.encodeText(character);
        safe += character;
      } catch {
        safe += "?";
      }
    }
    return safe;
  };
  const drawText = (text: unknown, x: number, y: number, size = 10, font = regular, color = dark) =>
    page.drawText(sanitizePdfText(text), { x, y, size, font, color });
  const label = (text: string, x: number, y: number) => drawText(text.toUpperCase(), x, y, 8, regular, muted);
  const wrapText = (value: unknown, maxWidth: number, size = 8, font = regular, maxLines = 3) => {
    const words = sanitizePdfText(value).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return ["None"];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
        if (lines.length === maxLines - 1) break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (words.join(" ") !== lines.join(" ")) {
      const last = lines.length - 1;
      while (lines[last] && font.widthOfTextAtSize(`${lines[last]}…`, size) > maxWidth) {
        lines[last] = lines[last].slice(0, -1);
      }
      lines[last] = `${lines[last]}…`;
    }
    return lines;
  };
  const drawWrappedText = (value: unknown, x: number, y: number, maxWidth: number, size = 8, maxLines = 3) =>
    wrapText(value, maxWidth, size, regular, maxLines).forEach((line, index) => drawText(line, x, y - index * 11, size));

  const storedAddress = [jobSite?.address, jobSite?.city, jobSite?.state, jobSite?.zip_code]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const jobAddress = String(row.manual_job_address ?? "").trim() || storedAddress || "Address not provided";

  const brandLogo = await loadBrandLogo(pdf);
  drawText("MC Labor Sources", 36, 752, 19, bold, blue);
  if (brandLogo) {
    const scale = Math.min(190 / brandLogo.width, 34 / brandLogo.height);
    const logoWidth = brandLogo.width * scale;
    page.drawImage(brandLogo, {
      x: 576 - logoWidth,
      y: 741,
      width: logoWidth,
      height: brandLogo.height * scale,
    });
  }
  drawText("TIMESHEET", 36, 724, 9, bold, muted);

  page.drawRectangle({ x: 36, y: 580, width: 540, height: 132, color: panel, borderColor: border, borderWidth: 1 });
  label("Employee", 50, 688); drawText(employeeName, 50, 671, 11, bold);
  label("Company", 310, 688); drawText(companyName, 310, 671, 11, bold);
  label("Job site", 50, 651); drawText(row.manual_job_name || jobSite?.name || "Job site", 50, 635, 11, bold);
  drawWrappedText(jobAddress, 50, 621, 225, 8, 2);
  label("Period", 310, 651); drawText(period, 310, 635, 11, bold);
  label("Total hours", 50, 597); drawText(formatHours(row.total_hours), 50, 583, 11, bold, blue);
  label("Status", 310, 597); drawText(String(row.status ?? "SUBMITTED"), 310, 583, 10, bold, rgb(0.62, 0.43, 0.05));

  const tableTop = 555;
  page.drawRectangle({ x: 36, y: 329, width: 540, height: 238, borderColor: border, borderWidth: 1 });
  label("Time entries", 50, tableTop);
  const columns = [50, 532];
  ["Date", "Hours"].forEach((heading, index) =>
    drawText(heading, columns[index], tableTop - 25, 9, bold, muted)
  );
  page.drawLine({ start: { x: 50, y: tableTop - 34 }, end: { x: 562, y: tableTop - 34 }, thickness: 1, color: border });
  dates.slice(0, 7).forEach((date, index) => {
    const entry: any = entriesByDate.get(date);
    const y = tableTop - 58 - index * 25;
    drawText(date, columns[0], y, 9);
    drawText(formatHours(entry?.hours), columns[1], y, 9);
    if (index < 6) page.drawLine({ start: { x: 50, y: y - 10 }, end: { x: 562, y: y - 10 }, thickness: 0.5, color: border });
  });

  page.drawRectangle({ x: 36, y: 223, width: 540, height: 92, borderColor: border, borderWidth: 1 });
  label("Foreman notes", 50, 299);
  drawWrappedText(signature?.foreman_notes || assignment?.notes, 50, 286, 512, 8, 2);
  page.drawLine({ start: { x: 50, y: 266 }, end: { x: 562, y: 266 }, thickness: 0.5, color: border });
  label("Employee notes", 50, 254);
  drawWrappedText(row.notes, 50, 241, 512, 8, 2);

  if (signature) {
    page.drawRectangle({ x: 36, y: 167, width: 540, height: 44, borderColor: border, borderWidth: 1 });
    label("Foreman", 50, 195); drawText(signature.foreman_name || "Signed", 50, 179, 10, bold);
    label("Foreman cell", 180, 195); drawText(signature.foreman_phone || jobSite?.foreman_phone || "—", 180, 179, 9, bold);
    label("Signed", 310, 195);
    drawText(signature.signed_at ? new Date(signature.signed_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Signed", 310, 179, 10, bold);

    const signatureImage = await loadSignatureImage(pdf, signature.signature_image_url);
    if (signatureImage) {
      page.drawRectangle({ x: 36, y: 62, width: 540, height: 93, borderColor: border, borderWidth: 1 });
      label("Foreman signature", 50, 137);
      const scale = Math.min(440 / signatureImage.width, 55 / signatureImage.height, 1);
      const width = signatureImage.width * scale;
      const height = signatureImage.height * scale;
      page.drawImage(signatureImage, { x: 306 - width / 2, y: 70 + (52 - height) / 2, width, height });
    }
  }
  drawText("Generated by MC Labor Sources", 36, 48, 8, regular, muted);

  return await pdf.save();
}

function buildWeeklySummaryEmail(rows: any[], approvalUrl: string, approveAllUrl: string, recipientName: string) {
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
      hasSignature: Boolean(relation(row.signature)?.signature_image_url),
    };
  });
  const periodStarts = rows.map((row: any) => row.week_start_date || row.work_date).filter(Boolean).sort();
  const periodEnds = rows.map((row: any) => row.week_end_date || row.work_date).filter(Boolean).sort();
  const periodStart = periodStarts[0] ?? "";
  const periodEnd = periodEnds[periodEnds.length - 1] ?? "";
  const missingSignatures = weeklyRows.filter((row) => !row.hasSignature);
  const missingSignaturePeople = missingSignatures
    .map((row) => `${row.firstName} ${row.lastName}, who worked at the ${row.job} job`)
    .join("; ");
  const missingSignatureNotice = missingSignatures.length
    ? `Please note that, as of the time of this email, we have not received ${missingSignatures.length === 1 ? "a signed timesheet" : "signed timesheets"} for ${missingSignaturePeople}. When convenient, please verify the hours ${missingSignatures.length === 1 ? "this employee worked" : "these employees worked"} and confirm with us that the reported hours are accurate.`
    : "";
  const missingSignatureRows = missingSignatures.map((row) => `
    <tr>
      <td style="padding:9px 8px;border-top:1px solid #fecaca;font-weight:700">${escapeHtml(`${row.firstName} ${row.lastName}`.trim())}</td>
      <td style="padding:9px 8px;border-top:1px solid #fecaca">${escapeHtml(row.job)}</td>
      <td style="padding:9px 8px;border-top:1px solid #fecaca;color:#b91c1c;font-weight:700;text-align:right;white-space:nowrap">Not received</td>
    </tr>
  `).join("");
  const formatDate = (value: string) => value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";
  const formatShortDate = (value: string) => value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";
  const verificationDeadline = periodEnd
    ? new Date(`${periodEnd}T00:00:00Z`)
    : null;
  if (verificationDeadline) {
    const daysUntilWednesday = (3 - verificationDeadline.getUTCDay() + 7) % 7 || 7;
    verificationDeadline.setUTCDate(verificationDeadline.getUTCDate() + daysUntilWednesday);
  }
  const deadlineDay = verificationDeadline?.getUTCDate() ?? 0;
  const ordinalSuffix = deadlineDay % 100 >= 11 && deadlineDay % 100 <= 13
    ? "th"
    : deadlineDay % 10 === 1 ? "st" : deadlineDay % 10 === 2 ? "nd" : deadlineDay % 10 === 3 ? "rd" : "th";
  const formattedDeadline = verificationDeadline
    ? `${verificationDeadline.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${verificationDeadline.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })} ${deadlineDay}${ordinalSuffix}`
    : "the requested deadline";
  const dayHeadings = periodStart
    ? enumerateDates(periodStart, periodEnd).slice(0, 7).map((date, index) => {
        const day = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][index];
        const compactDate = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC",
        });
        return `${day}<br>${compactDate}`;
      })
    : ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
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
    `Hi ${recipientName || "there"},`,
    `These are the hours submitted by the employees for the weekending ${formatShortDate(periodEnd)}. Please review and verify that the hours are accurate before we generate your invoice. You can view all timesheets and make any necessary edits by clicking the link below.`,
    `From: ${formatDate(periodStart)}`,
    `To: ${formatDate(periodEnd)}`,
    "",
    headings.join("\t"),
    ...plainRows,
    "",
    `${rows.length} signed timesheet PDF${rows.length === 1 ? " is" : "s are"} attached.`,
    "",
    `VIEW TIMESHEETS / REQUEST CHANGES: ${approvalUrl}`,
    `CLICK TO APPROVE ALL HOURS REPORTED: ${approveAllUrl}`,
    ...(missingSignatureNotice ? ["", missingSignatureNotice] : []),
    "",
    `We kindly ask that all hours be verified by 11:00 a.m. on ${formattedDeadline} to help ensure your invoices can be submitted and payroll processed on time.`,
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
      <td style="${cell};font-weight:700;color:${row.hasSignature ? "#047857" : "#b91c1c"}">${row.hasSignature ? "Attached" : "Not received"}</td>
    </tr>
  `).join("");
  const html = `
    <style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding:20px 10px!important}.desktop-hours{display:block!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}.action-cell{display:block!important;width:100%!important;padding:0 0 10px!important}.action-or{display:block!important;width:100%!important;padding:2px 0 12px!important;text-align:center!important}.action-button{display:block!important;text-align:center!important;padding:15px 12px!important}}</style>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9"><tr><td align="center" class="email-pad" style="padding:28px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-shell" style="width:100%;max-width:760px;background:#ffffff;border-radius:14px"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#0f172a">
      <p style="margin:0 0 28px;font-size:16px;font-weight:700">Hi ${escapeHtml(recipientName || "there")}</p>
      <p style="margin:0 0 26px;font-size:15px;font-weight:700;line-height:1.55">These are the hours submitted by the employees for the weekending ${escapeHtml(formatShortDate(periodEnd))}. Please review and verify that the hours are accurate before we generate your invoice. You can view all timesheets and make any necessary edits by clicking the link below.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>
        <td class="action-cell" bgcolor="#1d4ed8" style="border-radius:10px;box-shadow:0 4px 10px rgba(29,78,216,.22)"><a class="action-button" href="${escapeHtml(approvalUrl)}" target="_blank" style="display:block;padding:14px 18px;border:1px solid #1d4ed8;border-radius:10px;background:#1d4ed8;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;line-height:20px;text-align:center;text-decoration:none;text-transform:uppercase">View Timesheets / Request Changes</a></td>
        <td class="action-or" style="width:64px;padding:0 10px;text-align:center"><span style="display:inline-block;padding:7px 8px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#475569;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;line-height:12px">OR</span></td>
        <td class="action-cell" bgcolor="#dc2626" style="border-radius:10px;box-shadow:0 4px 10px rgba(220,38,38,.2)"><a class="action-button" href="${escapeHtml(approveAllUrl)}" target="_blank" style="display:block;padding:14px 18px;border:1px solid #dc2626;border-radius:10px;background:#dc2626;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;line-height:20px;text-align:center;text-decoration:none;text-transform:uppercase">Click to Approve All Hours Reported</a></td>
      </tr></table>
      ${missingSignatureNotice ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;color:#7f1d1d;font-size:13px;overflow:hidden"><tr><td colspan="3" style="padding:11px 12px;background:#fee2e2;font-size:14px;font-weight:700">⚠ Missing Signed Timesheets</td></tr><tr><th style="padding:8px;text-align:left">Employee</th><th style="padding:8px;text-align:left">Job</th><th style="padding:8px;text-align:right">Status</th></tr>${missingSignatureRows}<tr><td colspan="3" style="padding:10px 8px;border-top:1px solid #fecaca;font-size:12px;line-height:1.4">Please verify that the reported hours are accurate.</td></tr></table>` : ""}
      <div class="desktop-hours" style="display:block;overflow-x:auto">
        <table style="width:100%;min-width:720px;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#050505;color:#ffffff"><th colspan="14" style="padding:10px;text-align:center;font-size:21px">Mc Labor Sources, Inc. Timesheets</th></tr><tr style="background:#050505;color:#ffffff">
            ${["Job Name", "First Name", "Last Name", ...dayHeadings, "TH", "RH", "OT", "Signed Timesheet"].map((heading, index) => `<th style="padding:7px 8px;border:1px solid #ffffff;text-align:${index > 2 && index < 13 ? "right" : "left"}">${heading}</th>`).join("")}
          </tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <p style="margin:28px 0 0;color:#0f172a;font-size:15px;font-weight:700;line-height:1.55">We kindly ask that all hours be verified by 11:00 a.m. on ${escapeHtml(formattedDeadline)} to help ensure your invoices can be submitted and payroll processed on time.</p>
    </td></tr></table></td></tr></table>
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

    const body = await req.json() as {
      action?: "send" | "preview";
      timesheetId?: string;
      timesheetIds?: string[];
      deliveryMode?: "BULK" | "INDIVIDUAL";
    };
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
        "id, customer_id, status, is_training, ready_to_send, content_edited_at, week_start_date, week_end_date, work_date, total_hours, notes, manual_job_name, manual_job_address, employee:employees(first_name,last_name), customer:customers(office_email,company_name,contacts:customer_contacts(first_name,last_name,title,email,slot_number)), job_site:job_sites(name,address,city,state,zip_code,foreman_phone), assignment:job_assignments(notes), signature:timesheet_signatures(*), entries:timesheet_entries(work_date,start_time,end_time,hours)",
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
    const customer = relation(rows[0].customer);
    if (body.action === "preview") {
      if (rows.length !== 1) return jsonResponse({ error: "Preview one timesheet at a time" }, 400);
      const pdf = await createTimesheetPdf(rows[0], customer?.company_name ?? "Customer");
      return new Response(pdf, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline; filename=customer-timesheet.pdf",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const deliveryMode = body.deliveryMode ?? "BULK";
    if (!(["BULK", "INDIVIDUAL"] as const).includes(deliveryMode)) {
      return jsonResponse({ error: "Invalid timesheet delivery mode" }, 400);
    }
    const invalid = rows.find((row: any) => row.status !== "SUBMITTED");
    if (invalid) {
      return jsonResponse({ error: "Only timesheets submitted to the office can be sent" }, 400);
    }
    const notReady = rows.find((row: any) => !row.ready_to_send);
    if (notReady) {
      return jsonResponse({ error: "Every selected timesheet must be marked ready to send" }, 400);
    }

    const { data: previousDeliveries, error: previousDeliveriesError } = await adminClient
      .from("timesheet_delivery_items")
      .select("timesheet_id, review_requested_at, batch:timesheet_delivery_batches(sent_at)")
      .in("timesheet_id", ids);
    if (previousDeliveriesError) throw previousDeliveriesError;

    for (const id of ids) {
      const history = (previousDeliveries ?? [])
        .filter((item: any) => item.timesheet_id === id)
        .sort((left: any, right: any) => {
          const leftBatch = relation(left.batch);
          const rightBatch = relation(right.batch);
          return String(rightBatch?.sent_at ?? "").localeCompare(String(leftBatch?.sent_at ?? ""));
        });
      if (!history.length) continue;

      const latestBatch = relation(history[0].batch);
      const latestSentAt = latestBatch?.sent_at
        ? new Date(latestBatch.sent_at).getTime()
        : 0;
      const selectedTimesheet = rows.find((row: any) => row.id === id);
      const editedAt = selectedTimesheet?.content_edited_at
        ? new Date(selectedTimesheet.content_edited_at).getTime()
        : 0;
      if (!editedAt || editedAt <= latestSentAt) {
        return jsonResponse({
          error: "A selected timesheet was already sent and cannot be sent again until its hours or notes are edited and saved.",
        }, 409);
      }
    }

    const verifyHoursContact = (customer?.contacts ?? [])
      .filter((contact: any) => contact?.email?.trim())
      .sort((left: any, right: any) => Number(left.slot_number ?? 99) - Number(right.slot_number ?? 99))
      .find((contact: any) => String(contact.title ?? "").trim().toLowerCase() === "verify hours");
    const recipientEmail = verifyHoursContact?.email?.trim() || customer?.office_email?.trim();
    if (!recipientEmail) {
      return jsonResponse({ error: "This customer does not have an office email address" }, 400);
    }

    const recipientName = String(verifyHoursContact?.first_name ?? "").trim()
      || String(verifyHoursContact?.last_name ?? "").trim();
    const subject = "Please verify hours ASAP";
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

    const webAppUrl = normalizedWebAppUrl();
    const approvalToken = createApprovalToken();
    const approvalTokenHash = await sha256(approvalToken);
    const approvalExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const approvalUrl = `${webAppUrl}/customer-timesheet-approval?token=${encodeURIComponent(approvalToken)}`;
    const approveAllUrl = `${approvalUrl}&action=approve-all`;
    const summaryEmail = buildWeeklySummaryEmail(rows, approvalUrl, approveAllUrl, recipientName);
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
        approval_token_hash: approvalTokenHash,
        approval_expires_at: approvalExpiresAt,
        delivery_mode: deliveryMode,
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
