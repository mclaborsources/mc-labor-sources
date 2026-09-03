import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.108.1";
import { portalErrorMessage, provisionWorkerPortal } from "../_shared/worker-portal.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller } = await admin.from("users").select("role,status")
      .eq("auth_user_id", auth.user.id).single();
    if (!caller || caller.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(caller.role)) {
      return json({ error: "Admin access required" }, 403);
    }
    const { employeeIds } = await req.json();
    if (!Array.isArray(employeeIds) || employeeIds.length > 25 ||
        employeeIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      return json({ error: "Provide up to 25 employee IDs" }, 400);
    }
    const results = [];
    for (const employeeId of new Set<string>(employeeIds)) {
      try {
        const { data: employee, error } = await admin.from("employees")
          .select("id,first_name,last_name,phone,status").eq("id", employeeId).single();
        if (error) throw error;
        results.push(await provisionWorkerPortal(admin, employee, Deno.env.get("WORKER_CREDENTIAL_KEY") ?? ""));
      } catch (error) {
        results.push({ employeeId, status: "error", message: portalErrorMessage(error) });
      }
    }
    return json({ results });
  } catch (error) {
    return json({ error: portalErrorMessage(error) }, 500);
  }
});
