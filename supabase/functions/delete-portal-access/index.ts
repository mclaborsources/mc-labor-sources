import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }
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
    if (!employeeId) return json({ error: "Employee ID is required" }, 400);

    const { data: employee, error: employeeError } = await adminClient
      .from("employees")
      .select("id, first_name, last_name, email")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) return json({ error: employeeError.message }, 400);
    if (!employee) return json({ error: "Employee was not found" }, 404);

    let { data: profiles, error: profileError } = await adminClient
      .from("users")
      .select("id, auth_user_id, email, status")
      .eq("employee_id", employeeId);

    if (profileError) return json({ error: profileError.message }, 400);

    // Older portal accounts may not have an employee_id link. Fall back to the
    // selected employee's exact email, then exact display name.
    if (!profiles?.length && employee.email) {
      const emailLookup = await adminClient
        .from("users")
        .select("id, auth_user_id, email, status")
        .eq("role", "WORKER")
        .ilike("email", employee.email.trim());
      if (emailLookup.error) return json({ error: emailLookup.error.message }, 400);
      profiles = emailLookup.data;
    }

    if (!profiles?.length) {
      const employeeName = `${employee.first_name} ${employee.last_name}`.trim();
      const nameLookup = await adminClient
        .from("users")
        .select("id, auth_user_id, email, status")
        .eq("role", "WORKER")
        .ilike("name", employeeName);
      if (nameLookup.error) return json({ error: nameLookup.error.message }, 400);
      profiles = nameLookup.data;
    }

    if (!profiles?.length) return json({ error: "No portal account was found for this employee" }, 404);
    if (profiles.length > 1) {
      return json({ error: "Multiple portal accounts match this employee. Contact support before deleting." }, 409);
    }
    if ((profiles ?? []).some((profile) => profile.auth_user_id === authData.user.id || profile.id === caller.id)) {
      return json({ error: "You cannot delete your own portal access" }, 400);
    }

    for (const profile of profiles ?? []) {
      if (profile.auth_user_id) {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(profile.auth_user_id);
        if (deleteError) return json({ error: deleteError.message }, 400);
      }

      // Remove the portal profile completely when no historical audit record
      // requires it. Otherwise retain only an anonymized audit placeholder.
      const { error: deleteProfileError } = await adminClient
        .from("users")
        .delete()
        .eq("id", profile.id);

      if (deleteProfileError) {
        const { error: anonymizeError } = await adminClient
          .from("users")
          .update({
            auth_user_id: null,
            employee_id: null,
            name: "Deleted portal user",
            email: `deleted+${profile.id}@invalid.mclabor.local`,
            phone: null,
            status: "INACTIVE",
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id);
        if (anonymizeError) return json({ error: anonymizeError.message }, 400);
      }
    }

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
