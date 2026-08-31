import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getAuthedClient, jsonResponse } from "../_shared/messaging.ts";

type PushPayload = {
  userId?: string;
  employeeId?: string;
  employeeIds?: string[];
  conversationId?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

async function resolveUserIds(
  adminClient: Awaited<ReturnType<typeof getAuthedClient>>["adminClient"],
  payload: PushPayload,
): Promise<string[]> {
  const ids = new Set<string>();
  if (payload.userId) ids.add(payload.userId);

  if (payload.employeeId) {
    const { data: users } = await adminClient
      .from("users")
      .select("id")
      .eq("employee_id", payload.employeeId)
      .eq("status", "ACTIVE");
    for (const u of users ?? []) {
      ids.add(u.id as string);
    }
  }

  if (payload.employeeIds?.length) {
    const { data: users } = await adminClient
      .from("users")
      .select("id")
      .in("employee_id", payload.employeeIds)
      .eq("status", "ACTIVE");
    for (const u of users ?? []) {
      ids.add(u.id as string);
    }
  }

  return [...ids];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await getAuthedClient(req);
    if ("error" in auth && auth.error) return auth.error;

    const { adminClient, caller } = auth;
    const payload = (await req.json()) as PushPayload;
    if (!payload.title || !payload.body) {
      return jsonResponse({ error: "title and body are required" }, 400);
    }
    payload.title = payload.title.trim();
    payload.body = payload.body.trim();
    if (payload.title.length > 100 || payload.body.length > 500) {
      return jsonResponse({ error: "Title must be 100 characters or fewer and message 500 or fewer" }, 400);
    }
    const isMessage = payload.data?.type === "MESSAGE";
    const isAssignmentNotice = payload.data?.type === "ASSIGNMENT_NOTICE";
    if (isMessage) {
      const conversationId = payload.conversationId || payload.data?.id;
      if (!conversationId || !["WORKER", "SUPERVISOR"].includes(caller.role)) {
        return jsonResponse({ error: "Invalid message notification" }, 403);
      }

      const { data: conversation } = await adminClient
        .from("message_conversations")
        .select("worker_user_id, supervisor_user_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (!conversation || ![conversation.worker_user_id, conversation.supervisor_user_id].includes(caller.id)) {
        return jsonResponse({ error: "Conversation not found" }, 403);
      }

      const recipientId = conversation.worker_user_id === caller.id
        ? conversation.supervisor_user_id
        : conversation.worker_user_id;
      if (payload.userId && payload.userId !== recipientId) {
        return jsonResponse({ error: "Invalid message recipient" }, 403);
      }
      payload.userId = recipientId;
      delete payload.employeeId;
      delete payload.employeeIds;
    } else {
      const allowedRoles = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"];
      if (!allowedRoles.includes(caller.role)) {
        return jsonResponse({ error: "Insufficient permissions" }, 403);
      }
      if (!payload.userId && !payload.employeeId && !payload.employeeIds?.length) {
        return jsonResponse({ error: "At least one recipient is required" }, 400);
      }
    }

    if (isAssignmentNotice) {
      if (!["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
        return jsonResponse({ error: "Only administrators can send assignment notifications" }, 403);
      }
      const employeeIds = [...new Set(payload.employeeIds ?? [])];
      if (!employeeIds.length || employeeIds.length > 250) {
        return jsonResponse({ error: "Select between 1 and 250 employees" }, 400);
      }
      payload.employeeIds = employeeIds;
      delete payload.employeeId;
      delete payload.userId;

      const { data: recipientUsers, error: recipientError } = await adminClient
        .from("users")
        .select("id, employee_id")
        .in("employee_id", employeeIds)
        .eq("status", "ACTIVE");
      if (recipientError) throw recipientError;
      const userByEmployee = new Map(
        (recipientUsers ?? []).map((user) => [user.employee_id as string, user.id as string]),
      );
      const { error: notificationError } = await adminClient.from("notifications").insert(
        employeeIds.map((employeeId) => ({
          user_id: userByEmployee.get(employeeId) ?? null,
          employee_id: employeeId,
          title: payload.title.trim(),
          message: payload.body.trim(),
          type: "SYSTEM",
        })),
      );
      if (notificationError) throw notificationError;
    }

    const { data: settingsRows } = await adminClient.from("company_settings").select("push_enabled").limit(1);
    const pushEnabled = Boolean(settingsRows?.[0]?.push_enabled);
    if (!pushEnabled) {
      return jsonResponse({
        success: true,
        sent: 0,
        inApp: isAssignmentNotice ? payload.employeeIds?.length ?? 0 : 0,
        skipped: true,
        reason: "Push notifications disabled",
      });
    }

    const userIds = await resolveUserIds(adminClient, payload);
    if (!userIds.length) {
      return jsonResponse({
        success: true,
        sent: 0,
        inApp: isAssignmentNotice ? payload.employeeIds?.length ?? 0 : 0,
        skipped: true,
        reason: "No active mobile accounts found",
      });
    }

    const { data: tokens } = await adminClient
      .from("push_device_tokens")
      .select("expo_push_token")
      .in("user_id", userIds);

    const expoTokens = [...new Set((tokens ?? []).map((t) => t.expo_push_token as string))];
    if (!expoTokens.length) {
      return jsonResponse({
        success: true,
        sent: 0,
        inApp: isAssignmentNotice ? payload.employeeIds?.length ?? 0 : 0,
        skipped: true,
        reason: "No device tokens registered",
      });
    }

    const messages = expoTokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const results = [];
    for (let index = 0; index < messages.length; index += 100) {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages.slice(index, index + 100)),
      });
      const result = await res.json();
      if (!res.ok) {
        return jsonResponse({ error: JSON.stringify(result) }, 500);
      }
      results.push(result);
    }

    return jsonResponse({
      success: true,
      sent: expoTokens.length,
      inApp: isAssignmentNotice ? payload.employeeIds?.length ?? 0 : 0,
      result: results,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
