import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.108.1";
import { portalErrorMessage, provisionWorkerPortal } from "../_shared/worker-portal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmployeeRow {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  hourlyRate?: number;
  status?: string;
}

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
      .select("role,status")
      .eq("auth_user_id", authData.user.id)
      .single();

    if (!caller || caller.status !== "ACTIVE" || !["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rows: EmployeeRow[] = body.rows ?? [];

    const result = {
      imported: 0,
      skipped: 0,
      errors: [] as { row: number; message: string }[],
      results: [] as {
        row: number;
        success: boolean;
        message?: string;
        id?: string;
        generatedPassword?: string;
        username?: string;
      }[],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      if (!row.firstName?.trim() || !row.lastName?.trim()) {
        result.skipped += 1;
        const msg = "First and last name are required";
        result.errors.push({ row: rowNum, message: msg });
        result.results.push({ row: rowNum, success: false, message: msg });
        continue;
      }

      const { data: employee, error: empError } = await adminClient
        .from("employees")
        .insert({
          first_name: row.firstName.trim(),
          last_name: row.lastName.trim(),
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          position: row.position?.trim() || null,
          hourly_rate: row.hourlyRate ?? null,
          status: row.status ?? "ACTIVE",
        })
        .select()
        .single();

      if (empError || !employee) {
        result.skipped += 1;
        const msg = empError?.message || "Employee insert failed";
        result.errors.push({ row: rowNum, message: msg });
        result.results.push({ row: rowNum, success: false, message: msg });
        continue;
      }

      let username: string | undefined;
      let portalMessage: string | undefined;
      try {
        const portal = await provisionWorkerPortal(adminClient, employee, Deno.env.get("WORKER_CREDENTIAL_KEY") ?? "");
        username = portal.username;
      } catch (error) {
        portalMessage = `Employee imported; portal access needs attention: ${portalErrorMessage(error)}`;
        result.errors.push({ row: rowNum, message: portalMessage });
      }

      result.imported += 1;
      result.results.push({
        row: rowNum,
        success: true,
        id: employee.id,
        username,
        message: portalMessage,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
