import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.108.1";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Sign in as an administrator first." }, 401);
    const callerClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await callerClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "Your session expired. Sign in again." }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await admin.from("users")
      .select("role,status").eq("auth_user_id", auth.user.id).single();
    if (callerError || caller?.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(caller.role)) {
      return json({ error: "Active administrator access is required." }, 403);
    }
    const body = await req.json();
    if (body.passCode !== "3360") return json({ error: "Incorrect pass code." }, 403);
    if (body.action === "unlock") return json({ success: true });
    if (body.action === "list") {
      const accounts = [];
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) return json({ error: "Unable to load admin accounts." }, 500);
        for (const user of data.users) {
          if (user.app_metadata?.created_via === "admin-access") {
            accounts.push({ id: user.id, name: user.user_metadata?.name || "Admin", email: user.email, isSelf: user.id === auth.user.id });
          }
        }
        if (data.users.length < 100) break;
      }
      return json({ accounts });
    }
    if (body.action === "remove") {
      if (typeof body.accountId !== "string" || !body.accountId) return json({ error: "Select an account." }, 400);
      if (body.accountId === auth.user.id) return json({ error: "You cannot remove your own account." }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(body.accountId);
      if (targetError || !target.user) return json({ error: "Account not found." }, 404);
      if (target.user.app_metadata?.created_via !== "admin-access" || target.user.app_metadata?.role !== "ADMIN") {
        return json({ error: "Only admin accounts created on this page can be removed." }, 403);
      }
      const { data: profile, error: profileLookupError } = await admin.from("users").select("id,role")
        .eq("auth_user_id", body.accountId).maybeSingle();
      if (profileLookupError) return json({ error: "Unable to check the account." }, 500);
      if (profile && profile.role !== "ADMIN") return json({ error: "This account cannot be removed here." }, 403);
      // Disconnect authorization first: an already-issued JWT must no longer
      // resolve to an admin profile. Retain the row for historical audit FKs.
      if (profile) {
        const { error: disconnectError } = await admin.from("users").update({
          auth_user_id: null, status: "INACTIVE", updated_at: new Date().toISOString(),
          // Keep the historical profile ID, but release its login email.
          email: `deleted+${profile.id}@invalid.mclabor.local`,
        }).eq("id", profile.id).eq("role", "ADMIN");
        if (disconnectError) return json({ error: "Unable to revoke account access. Nothing was deleted." }, 500);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(body.accountId);
      if (deleteError) return json({ error: "Access was revoked, but login removal failed. Retry Remove to finish." }, 500);
      return json({ success: true });
    }
    if (body.action !== "create") return json({ error: "Invalid action." }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!name || name.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
      return json({ error: "Enter a name, valid email, and a password of 8–128 characters." }, 400);
    }
    const { data: existing, error: lookupError } = await admin.from("users").select("id").ilike("email", email).limit(1);
    if (lookupError) return json({ error: "Unable to check existing accounts. Try again." }, 500);
    if (existing?.length) return json({ error: "An account with this email already exists. Use a different email." }, 409);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name }, app_metadata: { role: "ADMIN", created_via: "admin-access" },
    });
    if (createError || !created.user) return json({ error: createError?.message || "Unable to create account." }, 400);
    const { error: profileError } = await admin.from("users").insert({
      auth_user_id: created.user.id, name, email, role: "ADMIN", status: "ACTIVE",
    });
    if (profileError) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: rollbackError ? "Account setup is incomplete. Contact support before retrying." : "Unable to create account profile. Please try again." }, 500);
    }
    return json({ success: true, name, email });
  } catch {
    return json({ error: "Unable to process the request. Please try again." }, 400);
  }
});
