// Keep this identifier in sync with supabase/functions/_shared/admin-login.ts.
export async function adminLoginEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hash}@admins.mc-labor.local`;
}
