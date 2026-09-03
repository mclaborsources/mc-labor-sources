import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.108.1";
import { workerCredentialEmail } from "../_shared/worker-credentials.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("WORKER_CREDENTIAL_KEY") ?? "";
  if (secret.length < 32) return json({ error: "Worker login is not configured." }, 503);
  try {
    const body = await req.text();
    if (body.length > 2048) return json({ error: "Invalid username or password." }, 400);
    const { username, password } = JSON.parse(body);
    if (typeof username !== "string" || typeof password !== "string" ||
        !/^[a-z]{1,3}$/i.test(username.trim()) || !password || password.length > 256) {
      return json({ error: "Invalid username or password." }, 400);
    }
    const email = await workerCredentialEmail(username, password, secret);
    // No admin key is used for sign-in. Supabase still verifies the password
    // and applies its Auth rate limits. Each request gets an isolated client.
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return json({ error: error?.status === 429 ? "Too many attempts. Try again later." : "Invalid username or password." }, error?.status === 429 ? 429 : 401);
    }
    const { data: profile, error: profileError } = await client.from("users")
      .select("id,role,status").eq("auth_user_id", data.user.id).single();
    if (profileError || profile?.role !== "WORKER" || profile.status !== "ACTIVE") {
      await client.auth.signOut();
      return json({ error: "Invalid username or password." }, 401);
    }
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    // Never return/log credentials, internal aliases, or raw provider errors.
    return json({ error: "Unable to sign in. Please try again." }, 400);
  }
});
