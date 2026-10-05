import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import safetyTipList from "../_shared/safety-tips.json" with { type: "json" };
import { corsHeaders, jsonResponse } from "../_shared/messaging.ts";

type SafetyTip = { week: number; title: string; message: string; isPlaceholder: boolean; isSample?: boolean };
type RunRow = {
  id: string;
  status: string;
  bulletin_id: string | null;
  started_at: string;
};

const tips = safetyTipList.tips as SafetyTip[];
const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function isAuthorized(req: Request) {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supplied = req.headers.get("apikey") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: weekdays[values.weekday] ?? 0,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function isoWeek(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const weekYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const firstThursday = new Date(jan4);
  firstThursday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  return { year: weekYear, week: 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return jsonResponse({ error: "Unauthorized scheduler request" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Supabase service configuration is missing" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let run: RunRow | null = null;
  try {
    const { data: schedule, error: scheduleError } = await admin
      .from("safety_tip_weekly_schedule").select("enabled,weekday,send_time,timezone,tip_order").eq("id", true).single();
    if (scheduleError) throw scheduleError;
    if (!schedule.enabled) return jsonResponse({ skipped: true, reason: "Weekly safety tips are disabled" });

    const now = new Date();
    const local = localParts(now, schedule.timezone);
    const [sendHour, sendMinute] = String(schedule.send_time).slice(0, 5).split(":").map(Number);
    if (local.weekday !== Number(schedule.weekday) || local.hour * 60 + local.minute < sendHour * 60 + sendMinute) {
      return jsonResponse({ skipped: true, reason: "Not due yet" });
    }

    const week = isoWeek(local.year, local.month, local.day);
    const tipNumber = Math.min(week.week, 52);
    const tipOrder = Array.isArray(schedule.tip_order) ? schedule.tip_order.map(Number) : [];
    const expectedTipNumbers = new Set(Array.from({ length: 52 }, (_, index) => index + 1));
    if (tipOrder.length !== 52 || new Set(tipOrder).size !== 52 || tipOrder.some((number) => !expectedTipNumbers.has(number))) {
      throw new Error("The saved safety tip order must contain each of the 52 tips exactly once.");
    }
    const selectedTipWeek = tipOrder[tipNumber - 1];
    const tip = tips.find((item) => item.week === selectedTipWeek);
    if (!tip) throw new Error(`Safety tip ${selectedTipWeek} is missing from the shared tip list.`);
    if (tip.isPlaceholder || tip.isSample) {
      return jsonResponse({ skipped: true, reason: `Week ${tipNumber} is still sample or placeholder content; replace it before delivery.` });
    }
    const displayMessage = tip.message.replaceAll("[EmFirstName]", "there");

    const { error: insertRunError } = await admin.from("safety_tip_weekly_runs").insert({
      iso_year: week.year,
      iso_week: week.week,
      tip_number: tip.week,
      status: "RUNNING",
      started_at: now.toISOString(),
      error_message: null,
    });
    if (insertRunError && insertRunError.code !== "23505") throw insertRunError;

    const { data: existingRun, error: loadRunError } = await admin.from("safety_tip_weekly_runs")
      .select("id,status,bulletin_id,started_at")
      .eq("iso_year", week.year).eq("iso_week", week.week).single();
    if (loadRunError) throw loadRunError;
    run = existingRun as RunRow;
    if (run.status === "SENT") return jsonResponse({ skipped: true, reason: "This week's tip was already sent" });
    if ((run.status === "FAILED" || run.status === "PARTIAL") && now.getTime() - new Date(run.started_at).getTime() < 3600000) {
      return jsonResponse({ skipped: true, reason: "A retry was attempted within the last hour" });
    }
    const { error: startRunError } = await admin.from("safety_tip_weekly_runs").update({
      status: "RUNNING", started_at: now.toISOString(), finished_at: null, error_message: null,
    }).eq("id", run.id);
    if (startRunError) throw startRunError;

    let bulletinId = run.bulletin_id;
    if (!bulletinId) {
      const { data: adminUser, error: adminUserError } = await admin.from("users")
        .select("id").in("role", ["SUPER_ADMIN", "ADMIN"]).eq("status", "ACTIVE").limit(1).maybeSingle();
      if (adminUserError) throw adminUserError;
      if (!adminUser) throw new Error("No active admin user is available to own the weekly bulletin record.");
      const { data: bulletin, error: bulletinError } = await admin.from("safety_bulletins").insert({
        title: tip.title,
        message: displayMessage,
        audience: "ALL_EMPLOYEES",
        sent_at: now.toISOString(),
        created_by_id: adminUser.id,
      }).select("id").single();
      if (bulletinError) throw bulletinError;
      bulletinId = bulletin.id as string;
      const { error: linkError } = await admin.from("safety_tip_weekly_runs").update({ bulletin_id: bulletinId }).eq("id", run.id);
      if (linkError) throw linkError;
      run.bulletin_id = bulletinId;
    }

    const mobileUsers: Array<{ id: string; employeeId: string }> = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await admin.from("users").select("id,employee_id")
        .eq("status", "ACTIVE").eq("role", "WORKER").not("employee_id", "is", null)
        .order("id").range(from, from + 499);
      if (error) throw error;
      mobileUsers.push(...(data ?? []).map((user) => ({
        id: user.id as string,
        employeeId: user.employee_id as string,
      })));
      if ((data?.length ?? 0) < 500) break;
    }

    const employeeIds = [...new Set(mobileUsers.map((user) => user.employeeId))];
    const { data: employees, error: employeeError } = employeeIds.length
      ? await admin.from("employees").select("id").in("id", employeeIds).eq("status", "ACTIVE")
      : { data: [], error: null };
    if (employeeError) throw employeeError;
    const activeEmployeeIds = new Set((employees ?? []).map((employee) => employee.id as string));
    const mobileUserByEmployee = new Map<string, string>();
    for (const user of mobileUsers) {
      if (activeEmployeeIds.has(user.employeeId) && !mobileUserByEmployee.has(user.employeeId)) {
        mobileUserByEmployee.set(user.employeeId, user.id);
      }
    }
    const recipients = [...mobileUserByEmployee.entries()].map(([employeeId, userId]) => ({ employeeId, userId }));
    const subject = "Weekly Safety Tip";

    for (const employee of recipients) {
      const { error: deliverySeedError } = await admin.from("safety_tip_weekly_deliveries").upsert({
        run_id: run.id,
        employee_id: employee.employeeId,
        recipient_email: "",
      }, { onConflict: "run_id,employee_id", ignoreDuplicates: true });
      if (deliverySeedError) throw deliverySeedError;

      const { data: delivery, error: deliveryLoadError } = await admin.from("safety_tip_weekly_deliveries")
        .select("id,notification_id").eq("run_id", run.id).eq("employee_id", employee.employeeId).single();
      if (deliveryLoadError) throw deliveryLoadError;

      if (!delivery.notification_id) {
        const { data: notification, error: notificationError } = await admin.from("notifications").insert({
          user_id: employee.userId,
          employee_id: employee.employeeId,
          title: subject,
          message: displayMessage,
          type: "SAFETY",
        }).select("id").single();
        if (notificationError) throw notificationError;
        const { error: linkNotificationError } = await admin.from("safety_tip_weekly_deliveries")
          .update({ notification_id: notification.id }).eq("id", delivery.id);
        if (linkNotificationError) throw linkNotificationError;
      }
    }

    let pushSent = 0;
    const { data: companySettings } = await admin.from("company_settings").select("push_enabled").limit(1).maybeSingle();
    if (companySettings?.push_enabled && recipients.length) {
      const userIds = recipients.map((employee) => employee.userId);
      const { data: tokens, error: tokenError } = await admin.from("push_device_tokens")
        .select("expo_push_token,user_id").in("user_id", userIds);
      if (tokenError) throw tokenError;
      const messages = [...new Map((tokens ?? []).map((token) => [
        token.expo_push_token as string,
        {
          to: token.expo_push_token as string,
          sound: "default",
          title: subject,
          body: `Week ${tipNumber}: ${tip.title}`.slice(0, 500),
          data: { type: "SAFETY", id: bulletinId },
        },
      ])).values()];
      for (let index = 0; index < messages.length; index += 100) {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages.slice(index, index + 100)),
        });
        if (!response.ok) throw new Error(`Phone push delivery failed: ${await response.text()}`);
        pushSent += messages.slice(index, index + 100).length;
      }
    }

    const { error: finishError } = await admin.from("safety_tip_weekly_runs").update({
      status: "SENT",
      recipients_count: recipients.length,
      finished_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", run.id);
    if (finishError) throw finishError;
      return jsonResponse({ success: true, status: "SENT", week: week.week, tip: tipNumber, tipWeek: tip.week, recipients: recipients.length, pushSent });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (run) {
      await admin.from("safety_tip_weekly_runs").update({
        status: "FAILED", finished_at: new Date().toISOString(), error_message: message.slice(0, 4000),
      }).eq("id", run.id);
    }
    return jsonResponse({ error: message }, 500);
  }
});
