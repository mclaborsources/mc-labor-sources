import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.108.1";
import { workerCredentialEmail } from "./worker-credentials.ts";

export const WORKER_LOGIN_DOMAIN = "workers.mc-labor.local";

export function portalErrorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String(error.message) : String(error);
}

export interface ImportedWorker {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
}

export function workerLoginPrefix(firstName: string): string {
  return firstName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "").slice(0, 3) || "emp";
}

export function workerInitialPassword(phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("A valid cell number (7–15 digits) is required for automatic portal access.");
  }
  return digits;
}

export async function provisionWorkerPortal(admin: SupabaseClient, employee: ImportedWorker, credentialSecret: string) {
  const { data: existing, error: lookupError } = await admin.from("users")
    .select("id,email").eq("employee_id", employee.id).eq("role", "WORKER").limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) return { employeeId: employee.id, status: "existing" as const };
  if (employee.status !== "ACTIVE") throw new Error("Inactive employees are not given automatic portal access.");

  const password = workerInitialPassword(employee.phone);
  const username = workerLoginPrefix(employee.first_name);
  const name = `${employee.first_name} ${employee.last_name}`.trim();
    const email = await workerCredentialEmail(username, password, credentialSecret);
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name },
      app_metadata: { role: "WORKER" },
    });
    if (authError) {
      if (["email_exists", "user_already_exists"].includes(authError.code ?? "")) {
        throw new Error("This username and password combination is already assigned to another employee. Portal access was not created.");
      }
      throw authError;
    }
    if (!created.user) throw new Error("Portal login could not be created.");

    const { error: profileError } = await admin.from("users").insert({
      auth_user_id: created.user.id, name, email, phone: employee.phone,
      role: "WORKER", status: "ACTIVE", employee_id: employee.id,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    const { error: settingsError } = await admin.from("employees").update({
      mobile_assignments_enabled: true,
      mobile_messages_enabled: true,
      mobile_tasks_enabled: false,
      mobile_profile_enabled: false,
      manual_timesheet_enabled: false,
      mobile_previous_week_enabled: false,
    }).eq("id", employee.id);
    if (settingsError) {
      await admin.from("users").delete().eq("auth_user_id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      throw settingsError;
    }
    return { employeeId: employee.id, status: "created" as const, username };
}
