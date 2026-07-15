import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getAuthedClient, jsonResponse } from "../_shared/messaging.ts";

type PushPayload = {
  userId?: string;
  employeeId?: string;
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
    const isMessage = payload.data?.type === "MESSAGE";
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
    } else {
      const allowedRoles = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"];
      if (!allowedRoles.includes(caller.role)) {
        return jsonResponse({ error: "Insufficient permissions" }, 403);
      }
      if (!payload.userId && !payload.employeeId) {
        return jsonResponse({ error: "userId or employeeId is required" }, 400);
      }
    }

    const { data: settingsRows } = await adminClient.from("company_settings").select("push_enabled").limit(1);
    const pushEnabled = Boolean(settingsRows?.[0]?.push_enabled);
    if (!pushEnabled) {
      return jsonResponse({ skipped: true, reason: "Push notifications disabled" });
    }

    const userIds = await resolveUserIds(adminClient, payload);
    if (!userIds.length) {
      return jsonResponse({ skipped: true, reason: "No users found" });
    }

    const { data: tokens } = await adminClient
      .from("push_device_tokens")
      .select("expo_push_token")
      .in("user_id", userIds);

    const expoTokens = [...new Set((tokens ?? []).map((t) => t.expo_push_token as string))];
    if (!expoTokens.length) {
      return jsonResponse({ skipped: true, reason: "No device tokens registered" });
    }

    const messages = expoTokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: JSON.stringify(result) }, 500);
    }

    return jsonResponse({ success: true, sent: expoTokens.length, result });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
