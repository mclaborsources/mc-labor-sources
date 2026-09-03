// This key stays in Edge Function secrets. Never derive this identifier in a
// public client or use an unkeyed hash of a predictable phone-number password.
export async function workerCredentialEmail(username: string, password: string, secret: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z]{1,3}$/.test(normalized) || !password || password.length > 256) {
    throw new Error("Invalid username or password.");
  }
  if (secret.length < 32) throw new Error("Worker login is not configured.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, encoder.encode(JSON.stringify(["worker-login-v1", normalized, password])),
  );
  // 192 bits, keeping the email local part below its 64-character limit.
  const digest = Array.from(new Uint8Array(signature)).slice(0, 24)
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${normalized}.${digest}@workers.mc-labor.local`;
}
