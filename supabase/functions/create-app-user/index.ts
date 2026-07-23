import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: caller } = await adminClient
      .from("users")
      .select("role")
      .eq("auth_user_id", authData.user.id)
      .single();

    if (!caller || !["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, email, password, phone, role, customerId, employeeId } = body;

    if (!name || !email || !password || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let authUser = null;
    let createdAuthUser = false;
    let existingProfileId: string | null = null;
    let replacedAuthUser: { id: string } | null = null;

    // Find an existing login so portal access can be transferred to the newly
    // selected employee instead of failing on Supabase's unique email constraint.
    for (let page = 1; page <= 100 && !authUser; page += 1) {
      const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (listError) throw listError;
      authUser = usersPage.users.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;
      if (usersPage.users.length < 100) break;
    }

    if (authUser) {
      const { data: existingProfile, error: profileLookupError } = await adminClient
        .from("users")
        .select("id")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      if (profileLookupError) throw profileLookupError;
      if (existingProfile) {
        const previousAuthUser = authUser;
        const revokedEmail = `revoked+${previousAuthUser.id}@invalid.mc-labor.local`;
        const { error: revokeError } = await adminClient.auth.admin.updateUserById(
          previousAuthUser.id,
          { email: revokedEmail, email_confirm: true },
        );
        if (revokeError) throw revokeError;

        const { data: replacement, error: replacementError } =
          await adminClient.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: { name },
            app_metadata: { role },
          });

        if (replacementError || !replacement.user) {
          await adminClient.auth.admin.updateUserById(previousAuthUser.id, {
            email: normalizedEmail,
            email_confirm: true,
          });
          return new Response(JSON.stringify({
            error: replacementError?.message || "Auth transfer failed",
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        existingProfileId = existingProfile.id;
        replacedAuthUser = previousAuthUser;
        authUser = replacement.user;
        createdAuthUser = true;
      } else {
        // Recover an Auth user left without an application profile by an
        // interrupted or older account-creation flow.
        const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(
          authUser.id,
          {
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: { name },
            app_metadata: { role },
          },
        );
        if (updateError || !updated.user) {
          return new Response(JSON.stringify({ error: updateError?.message || "Auth update failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUser = updated.user;
      }
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { role },
      });

      if (createError || !created.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Auth create failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authUser = created.user;
      createdAuthUser = true;
    }

    const profileValues = {
      auth_user_id: authUser.id,
      name,
      email: normalizedEmail,
      phone: phone || null,
      role,
      status: "ACTIVE",
      customer_id: customerId || null,
      employee_id: employeeId || null,
    };
    const profileQuery = existingProfileId
      ? adminClient.from("users").update(profileValues).eq("id", existingProfileId)
      : adminClient.from("users").insert(profileValues);
    const { data: profile, error: profileError } = await profileQuery
      .select()
      .single();

    if (profileError) {
      if (createdAuthUser) {
        await adminClient.auth.admin.deleteUser(authUser.id);
      }
      if (replacedAuthUser) {
        await adminClient.auth.admin.updateUserById(replacedAuthUser.id, {
          email: normalizedEmail,
          email_confirm: true,
        });
      }
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (replacedAuthUser) {
      await adminClient.auth.admin.deleteUser(replacedAuthUser.id);
    }

    return new Response(JSON.stringify({
      success: true,
      transferred: Boolean(existingProfileId),
      data: profile,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
