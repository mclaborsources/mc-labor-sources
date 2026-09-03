import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getAuthedClient, jsonResponse } from "../_shared/messaging.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const auth = await getAuthedClient(req);
    if ("error" in auth && auth.error) return auth.error;
    const { adminClient, caller } = auth;
    const { id } = await req.json();
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return jsonResponse({ error: "Invalid notification" }, 400);
    const { data: profile } = await adminClient.from("users").select("status").eq("id", caller.id).single();
    if (profile?.status !== "ACTIVE") return jsonResponse({ error: "Access denied" }, 403);
    // Ownership is part of the DELETE itself, not just a preceding read.
    let query = adminClient.from("notifications").delete().eq("id", id);
    query = caller.employee_id
      ? query.or(`user_id.eq.${caller.id},employee_id.eq.${caller.employee_id}`)
      : query.eq("user_id", caller.id);
    const { data, error } = await query.select("id");
    if (error) throw error;
    if (!data?.length) return jsonResponse({ error: "Notification not found" }, 404);
    return jsonResponse({ success: true });
  } catch {
    return jsonResponse({ error: "Could not delete notification" }, 500);
  }
});
