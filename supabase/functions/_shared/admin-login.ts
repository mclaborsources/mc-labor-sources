// A role-specific Auth identifier lets an employee and admin share a contact
// email without sharing a session, password, or authorization profile.
export async function adminLoginEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hash}@admins.mc-labor.local`;
}
