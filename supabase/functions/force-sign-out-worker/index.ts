import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Server configuration is incomplete" }, 500);
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid token" }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller, error: callerError } = await adminClient
      .from("users")
      .select("id, role")
      .eq("auth_user_id", authData.user.id)
      .single();
    if (callerError || !caller || !["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
      return json({ error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
    if (!employeeId) return json({ error: "An employee is required" }, 400);

    const { data: profiles, error: profileError } = await adminClient
      .from("users")
      .select("id, auth_user_id")
      .eq("employee_id", employeeId)
      .eq("role", "WORKER")
      .not("auth_user_id", "is", null);
    if (profileError) return json({ error: profileError.message }, 400);
    if (!profiles?.length) return json({ error: "No mobile account was found for this employee" }, 404);
    if (profiles.length > 1) return json({ error: "Multiple mobile accounts match this employee" }, 409);
    const target = profiles[0];
    if (!target.auth_user_id) return json({ error: "No mobile account was found for this employee" }, 404);
    if (target.auth_user_id === authData.user.id || target.id === caller.id) {
      return json({ error: "You cannot force sign-out your own account here" }, 400);
    }

    const { data: revokedCount, error: revokeError } = await adminClient.rpc("revoke_worker_auth_sessions", {
      p_auth_user_id: target.auth_user_id,
    });
    if (revokeError) return json({ error: revokeError.message }, 400);
    return json({ success: true, revokedSessions: Number(revokedCount ?? 0) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not sign out this employee" }, 500);
  }
});
