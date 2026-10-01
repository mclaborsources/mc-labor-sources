import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.108.1";
import { messageIds, messageIdVariants, threadMessageIds } from "../_shared/email-thread-v2.ts";

type Provider = "GMAIL" | "OUTLOOK";
type AdminContext = { admin: SupabaseClient; profileId: string };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-email-reply-v2-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return decoder.decode(base64ToBytes(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
}

async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey() {
  const secret = Deno.env.get("EMAIL_REPLY_V2_TOKEN_KEY");
  if (!secret || secret.length < 24) throw new Error("EMAIL_REPLY_V2_TOKEN_KEY is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value)));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

async function decrypt(value: string) {
  const combined = base64ToBytes(value);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, await encryptionKey(), combined.slice(12));
  return decoder.decode(plaintext);
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in as an administrator first." }, 401);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Your session expired. Sign in again." }, 401);
  const admin = serviceClient();
  const { data: profile } = await admin.from("users").select("id,role,status")
    .eq("auth_user_id", auth.user.id).maybeSingle();
  if (!profile || profile.status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return json({ error: "Active administrator access is required." }, 403);
  }
  return { admin, profileId: profile.id };
}

function providerSettings(provider: Provider) {
  if (provider === "GMAIL") return {
    clientId: Deno.env.get("GMAIL_OAUTH_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GMAIL_OAUTH_CLIENT_SECRET") || "",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
  };
  return {
    clientId: Deno.env.get("OUTLOOK_OAUTH_CLIENT_ID") || "",
    clientSecret: Deno.env.get("OUTLOOK_OAUTH_CLIENT_SECRET") || "",
    authorizeUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    scope: "openid email offline_access User.Read Mail.Read Mail.Read.Shared",
  };
}

function callbackUrl(provider: Provider) {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-reply-sync-v2?provider=${provider.toLowerCase()}`;
}

function safeReturnUrl() {
  const appUrl = (Deno.env.get("EMAIL_REPLY_V2_APP_URL") || "http://localhost:3000").replace(/\/$/, "");
  return `${appUrl}/email-reply-sync-v2`;
}

async function startOauth(provider: Provider, context: AdminContext) {
  const settings = providerSettings(provider);
  if (!settings.clientId || !settings.clientSecret) {
    return json({ error: `${provider === "GMAIL" ? "Gmail" : "Outlook"} OAuth credentials are not configured yet.` }, 409);
  }
  const state = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
  const { error } = await context.admin.from("email_reply_oauth_states_v2").insert({
    state_hash: await sha256(state), provider, requested_by_user_id: context.profileId,
    return_url: safeReturnUrl(), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return json({ error: "Unable to begin mailbox authorization." }, 500);
  const query = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: settings.scope,
    state,
  });
  if (provider === "GMAIL") {
    query.set("access_type", "offline");
    query.set("prompt", "consent");
  } else query.set("response_mode", "query");
  return json({ authorizationUrl: `${settings.authorizeUrl}?${query}` });
}

async function exchangeCode(provider: Provider, code: string) {
  const settings = providerSettings(provider);
  const body = new URLSearchParams({
    client_id: settings.clientId, client_secret: settings.clientSecret, code,
    redirect_uri: callbackUrl(provider), grant_type: "authorization_code",
  });
  if (provider === "OUTLOOK") body.set("scope", settings.scope);
  const response = await fetch(settings.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "OAuth token exchange failed");
  return payload as { access_token: string; refresh_token?: string; expires_in?: number };
}

async function mailboxProfile(provider: Provider, token: string) {
  const url = provider === "GMAIL"
    ? "https://gmail.googleapis.com/gmail/v1/users/me/profile"
    : "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error("Unable to read the authorized mailbox profile");
  return provider === "GMAIL"
    ? { id: payload.emailAddress as string, email: payload.emailAddress as string }
    : { id: payload.id as string, email: (payload.mail || payload.userPrincipalName) as string };
}

async function oauthCallback(url: URL) {
  const provider = url.searchParams.get("provider")?.toUpperCase() as Provider;
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const fallback = safeReturnUrl();
  if (!(["GMAIL", "OUTLOOK"].includes(provider)) || !state || !code) return Response.redirect(`${fallback}?connection=failed`, 302);
  const admin = serviceClient();
  const stateHash = await sha256(state);
  const { data: savedState } = await admin.from("email_reply_oauth_states_v2")
    .select("*").eq("state_hash", stateHash).eq("provider", provider).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!savedState) return Response.redirect(`${fallback}?connection=expired`, 302);
  await admin.from("email_reply_oauth_states_v2").delete().eq("state_hash", stateHash);
  try {
    const tokens = await exchangeCode(provider, code);
    const profile = await mailboxProfile(provider, tokens.access_token);
    const { data: connection, error: connectionError } = await admin.from("email_reply_connections_v2").upsert({
      provider, mailbox_email: profile.email.toLowerCase(), provider_account_id: profile.id,
      status: "CONNECTED", connected_by_user_id: savedState.requested_by_user_id,
      connected_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "provider,mailbox_email" }).select("id").single();
    if (connectionError || !connection) throw new Error("Unable to save the mailbox connection");
    const { data: previous } = await admin.from("email_reply_credentials_v2")
      .select("refresh_token_ciphertext").eq("connection_id", connection.id).maybeSingle();
    const refreshCiphertext = tokens.refresh_token
      ? await encrypt(tokens.refresh_token)
      : previous?.refresh_token_ciphertext;
    if (!refreshCiphertext) throw new Error("The provider did not return offline access. Reconnect and approve access.");
    const { error: credentialError } = await admin.from("email_reply_credentials_v2").upsert({
      connection_id: connection.id,
      access_token_ciphertext: await encrypt(tokens.access_token),
      refresh_token_ciphertext: refreshCiphertext,
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (credentialError) throw new Error("Unable to store mailbox credentials");
    return Response.redirect(`${savedState.return_url}?connection=success`, 302);
  } catch (error) {
    console.error("email-reply-sync-v2 OAuth callback", error);
    return Response.redirect(`${savedState.return_url}?connection=failed`, 302);
  }
}

async function accessToken(admin: SupabaseClient, connection: Record<string, any>) {
  const { data: credentials, error } = await admin.from("email_reply_credentials_v2")
    .select("*").eq("connection_id", connection.id).single();
  if (error || !credentials) throw new Error("Mailbox credentials were not found");
  if (new Date(credentials.access_token_expires_at || 0).getTime() > Date.now() + 60_000) {
    return decrypt(credentials.access_token_ciphertext);
  }
  if (!credentials.refresh_token_ciphertext) throw new Error("Reconnect this mailbox to restore offline access");
  const provider = connection.provider as Provider;
  const settings = providerSettings(provider);
  const body = new URLSearchParams({
    client_id: settings.clientId, client_secret: settings.clientSecret,
    refresh_token: await decrypt(credentials.refresh_token_ciphertext), grant_type: "refresh_token",
  });
  if (provider === "OUTLOOK") body.set("scope", settings.scope);
  const response = await fetch(settings.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Unable to refresh mailbox access");
  await admin.from("email_reply_credentials_v2").update({
    access_token_ciphertext: await encrypt(payload.access_token),
    access_token_expires_at: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("connection_id", connection.id);
  return payload.access_token as string;
}

function header(headers: Array<{ name?: string; value?: string }>, name: string) {
  return headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || null;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return fallback;
}

function gmailBody(payload: Record<string, any>): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;
  const visit = (part: Record<string, any>) => {
    const data = part.body?.data;
    if (data && part.mimeType === "text/plain" && !text) text = decodeBase64Url(data);
    if (data && part.mimeType === "text/html" && !html) html = decodeBase64Url(data);
    for (const child of part.parts || []) visit(child);
  };
  visit(payload);
  return { text, html };
}

async function findBatch(admin: SupabaseClient, inReplyTo: string | null, references: string[]) {
  const ids = threadMessageIds(inReplyTo, references.join(" "));
  for (const id of ids) {
    for (const value of messageIdVariants(id)) {
      const { data } = await admin.from("timesheet_delivery_batches").select("id")
        .eq("smtp_message_id", value).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (data?.id) return data.id as string;
    }
  }
  return null;
}

function recipientEmails(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const addresses = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string") continue;
    for (const address of item.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
      addresses.add(address.toLowerCase());
    }
  }
  return [...addresses];
}

function replyAliasMessageIds(toEmails: unknown) {
  const ids = new Set<string>();
  for (const address of recipientEmails(toEmails)) {
    const match = address.match(/^[^+@]+\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@([^@]+)$/i);
    if (match) ids.add(`<${match[1]}@${match[2]}>`);
  }
  return [...ids];
}

async function findBatchesForMessages(admin: SupabaseClient, messages: Array<Record<string, any>>) {
  const candidates = new Set<string>();
  for (const message of messages) {
    const allMessageIds = [...threadMessageIds(message.inReplyTo, message.references), ...replyAliasMessageIds(message.toEmails)];
    for (const id of allMessageIds) {
      for (const variant of messageIdVariants(id)) candidates.add(variant);
    }
  }

  const batchByMessageId = new Map<string, string>();
  const values = [...candidates];
  // Keep PostgREST filter URLs small; References can contain many long message IDs.
  for (let offset = 0; offset < values.length; offset += 10) {
    const { data, error } = await admin.from("timesheet_delivery_batches")
      .select("id,smtp_message_id,sent_at")
      .in("smtp_message_id", values.slice(offset, offset + 10))
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message || "Unable to look up sent timesheet emails");
    for (const batch of data || []) {
      if (!batch.smtp_message_id) continue;
      for (const variant of messageIdVariants(batch.smtp_message_id)) {
        if (!batchByMessageId.has(variant)) batchByMessageId.set(variant, batch.id);
      }
    }
  }
  return batchByMessageId;
}

function matchedBatchForMessage(message: Record<string, any>, batchByMessageId: Map<string, string>) {
  const ids = [...replyAliasMessageIds(message.toEmails), ...threadMessageIds(message.inReplyTo, message.references)];
  for (const id of ids) {
    for (const variant of messageIdVariants(id)) {
      const batchId = batchByMessageId.get(variant);
      if (batchId) return batchId;
    }
  }
  return null;
}

async function fetchGmailBody(token: string, messageId: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Unable to load a matched Gmail reply body");
  const item = await response.json();
  const body = gmailBody(item.payload || {});
  return { bodyText: body.text || item.snippet || null, bodyHtml: body.html };
}

async function fetchOutlookBody(token: string, mailboxEmail: string, messageId: string) {
  const params = new URLSearchParams({ "$select": "body,bodyPreview" });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/messages/${encodeURIComponent(messageId)}?${params}`,
    { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' } },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Unable to load a matched Outlook reply body");
  return { bodyText: payload.bodyPreview || null, bodyHtml: payload.body?.content || null };
}

async function saveReplies(admin: SupabaseClient, connection: Record<string, any>, replies: Array<{ message: Record<string, any>; batchId: string; bodyText: string | null; bodyHtml: string | null }>) {
  if (!replies.length) return;
  const rows = replies.map(({ message, batchId, bodyText, bodyHtml }) => ({
    connection_id: connection.id, provider: connection.provider,
    provider_message_id: message.providerMessageId, internet_message_id: message.internetMessageId,
    in_reply_to: message.inReplyTo, reference_ids: messageIds(message.references), matched_batch_id: batchId,
    match_status: "MATCHED", from_email: message.fromEmail,
    to_emails: message.toEmails || [], subject: message.subject, received_at: message.receivedAt,
    body_text: bodyText?.slice(0, 100_000) || null,
    body_html: bodyHtml?.slice(0, 200_000) || null,
    is_test: false,
  }));
  const { error } = await admin.from("email_replies_v2").upsert(rows, { onConflict: "connection_id,provider_message_id" });
  if (error) throw new Error(error.message || "Unable to save matched replies");
}

async function syncGmail(admin: SupabaseClient, connection: Record<string, any>, token: string) {
  const lastSync = connection.last_synced_at ? new Date(connection.last_synced_at).getTime() : Date.now();
  const after = Math.floor((lastSync - 7 * 86400_000) / 1000);
  const summaries: Array<Record<string, any>> = [];
  let pageToken: string | null = null;
  do {
    const params = new URLSearchParams({ maxResults: "100", q: `in:inbox after:${after}` });
    if (pageToken) params.set("pageToken", pageToken);
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = await listResponse.json();
    if (!listResponse.ok) throw new Error(list.error?.message || "Unable to read Gmail messages");
    summaries.push(...(list.messages || []));
    pageToken = list.nextPageToken || null;
  } while (pageToken);
  const messages: Array<Record<string, any>> = [];
  const metadataHeaders = ["Message-ID", "In-Reply-To", "References", "From", "To", "Subject"];
  for (let offset = 0; offset < summaries.length; offset += 10) {
    const page = summaries.slice(offset, offset + 10);
    const pageMessages = await Promise.all(page.map(async (summary) => {
      const params = new URLSearchParams({ format: "metadata" });
      for (const name of metadataHeaders) params.append("metadataHeaders", name);
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(summary.id)}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const item = await response.json();
      const headers = item.payload?.headers || [];
      return {
        providerMessageId: item.id, internetMessageId: header(headers, "Message-ID"),
        inReplyTo: header(headers, "In-Reply-To"), references: header(headers, "References"),
        fromEmail: header(headers, "From"), toEmails: [header(headers, "To")].filter(Boolean),
        subject: header(headers, "Subject"), receivedAt: new Date(Number(item.internalDate)).toISOString(),
      };
    }));
    messages.push(...pageMessages.filter((message): message is Record<string, any> => Boolean(message)));
  }
  return messages;
}

async function syncOutlook(connection: Record<string, any>, token: string, mailboxEmail: string) {
  const since = new Date(new Date(connection.last_synced_at || Date.now() - 30 * 86400_000).getTime() - 7 * 86400_000).toISOString();
  const select = "id,internetMessageId,internetMessageHeaders,from,toRecipients,subject,receivedDateTime";
  const params = new URLSearchParams({
    "$select": select, "$filter": `receivedDateTime ge ${since}`, "$orderby": "receivedDateTime asc", "$top": "100",
  });
  let nextUrl: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/mailFolders/inbox/messages?${params}`;
  const messages: Array<Record<string, any>> = [];
  while (nextUrl) {
    const response = await fetch(nextUrl, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' },
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        throw new Error(`Outlook could not read ${mailboxEmail}. Reconnect Outlook to approve shared mailbox read access, and confirm your Microsoft 365 account has permission to this mailbox. Details: ${payload.error?.message || response.statusText}`);
      }
      throw new Error(payload.error?.message || "Unable to read Outlook messages");
    }
    messages.push(...(payload.value || []).map((item: Record<string, any>) => ({
      providerMessageId: item.id, internetMessageId: item.internetMessageId,
      inReplyTo: header(item.internetMessageHeaders || [], "In-Reply-To"),
      references: header(item.internetMessageHeaders || [], "References"),
      fromEmail: item.from?.emailAddress?.address || null,
      toEmails: [
        ...(item.toRecipients || []).map((recipient: Record<string, any>) => recipient.emailAddress?.address),
        header(item.internetMessageHeaders || [], "To"),
      ].filter(Boolean),
      subject: item.subject, receivedAt: item.receivedDateTime,
    })));
    const following = payload["@odata.nextLink"] as string | undefined;
    nextUrl = following && following.startsWith("https://graph.microsoft.com/v1.0/") ? following : null;
  }
  return messages;
}

async function syncConnection(context: AdminContext, connectionId: string, requestedMailboxEmail?: string) {
  const { data: connection } = await context.admin.from("email_reply_connections_v2").select("*")
    .eq("id", connectionId).maybeSingle();
  if (!connection || !["GMAIL", "OUTLOOK"].includes(connection.provider)) return json({ error: "Mailbox connection not found." }, 404);
  if (connection.status === "DISCONNECTED") return json({ error: "This mailbox is disconnected. Reconnect it before syncing." }, 409);
  try {
    const token = await accessToken(context.admin, connection);
    const mailboxEmail = (requestedMailboxEmail || connection.mailbox_email).trim().toLowerCase();
    const messages = connection.provider === "GMAIL"
      ? await syncGmail(context.admin, connection, token)
      : await syncOutlook(connection, token, mailboxEmail);
    let matched = 0;
    let unmatched = 0;
    let skipped = 0;
    for (let offset = 0; offset < messages.length; offset += 100) {
      const page = messages.slice(offset, offset + 100);
      const batchByMessageId = await findBatchesForMessages(context.admin, page);
      const candidates = page.map((message) => ({ message, batchId: matchedBatchForMessage(message, batchByMessageId) }));
      const matchedMessages = candidates.filter((item): item is { message: Record<string, any>; batchId: string } => Boolean(item.batchId));
      skipped += candidates.length - matchedMessages.length;

      for (let matchedOffset = 0; matchedOffset < matchedMessages.length; matchedOffset += 5) {
        const matchedPage = matchedMessages.slice(matchedOffset, matchedOffset + 5);
        const replies = await Promise.all(matchedPage.map(async ({ message, batchId }) => {
          try {
            const body = connection.provider === "GMAIL"
              ? await fetchGmailBody(token, message.providerMessageId)
              : await fetchOutlookBody(token, mailboxEmail, message.providerMessageId);
            return { message, batchId, ...body };
          } catch (error) {
            console.error("Unable to fetch body for matched reply", error);
            return { message, batchId, bodyText: null, bodyHtml: null };
          }
        }));
        await saveReplies(context.admin, connection, replies);
        matched += replies.length;
      }
    }
    await context.admin.from("email_reply_connections_v2").update({
      status: "CONNECTED", last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    return json({ success: true, mailboxEmail: connection.provider === "OUTLOOK" ? mailboxEmail : connection.mailbox_email,
      checked: messages.length, matched, unmatched, skipped });
  } catch (error) {
    const message = errorMessage(error, "Mailbox synchronization failed");
    await context.admin.from("email_reply_connections_v2").update({ status: "ERROR", last_error: message, updated_at: new Date().toISOString() }).eq("id", connection.id);
    return json({ error: message }, 502);
  }
}

async function disconnectConnection(context: AdminContext, connectionId: string) {
  const { data: connection } = await context.admin.from("email_reply_connections_v2").select("id,provider")
    .eq("id", connectionId).maybeSingle();
  if (!connection || !["GMAIL", "OUTLOOK"].includes(connection.provider)) {
    return json({ error: "Mailbox connection not found." }, 404);
  }

  const { error: credentialError } = await context.admin.from("email_reply_credentials_v2")
    .delete().eq("connection_id", connectionId);
  if (credentialError) return json({ error: "Unable to remove the saved mailbox credentials." }, 500);

  const { error: connectionError } = await context.admin.from("email_reply_connections_v2").update({
    status: "DISCONNECTED", last_error: null, updated_at: new Date().toISOString(),
  }).eq("id", connectionId);
  if (connectionError) return json({ error: "Credentials were removed, but the mailbox status could not be updated." }, 500);

  return json({ success: true });
}

async function runMatchingTest(context: AdminContext) {
  const mailbox = "reply-sync-v2-test@invalid.local";
  const { data: connection, error: connectionError } = await context.admin.from("email_reply_connections_v2").upsert({
    provider: "TEST", mailbox_email: mailbox, provider_account_id: "local-test",
    status: "CONNECTED", connected_by_user_id: context.profileId, last_error: null, updated_at: new Date().toISOString(),
  }, { onConflict: "provider,mailbox_email" }).select("id").single();
  if (connectionError || !connection) return json({ error: "Unable to create the isolated test mailbox." }, 500);
  const { data: batch } = await context.admin.from("timesheet_delivery_batches")
    .select("id,smtp_message_id,subject,recipient_email").not("smtp_message_id", "is", null)
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (!batch?.smtp_message_id) return json({ error: "Send at least one timesheet email before running the thread-matching test." }, 409);
  const testId = `test-${crypto.randomUUID()}`;
  const matchedBatchId = await findBatch(context.admin, batch.smtp_message_id, []);
  const { error } = await context.admin.from("email_replies_v2").insert({
    connection_id: connection.id, provider: "TEST", provider_message_id: testId,
    internet_message_id: `<${testId}@invalid.local>`, in_reply_to: batch.smtp_message_id,
    reference_ids: [batch.smtp_message_id], matched_batch_id: matchedBatchId,
    match_status: matchedBatchId ? "MATCHED" : "UNMATCHED", from_email: "customer@example.com",
    to_emails: [mailbox], subject: `Re: ${batch.subject}`, received_at: new Date().toISOString(),
    body_text: "This is a V2 test reply. No real mailbox message was read.", is_test: true,
  });
  if (error) return json({ error: "Unable to save the test reply." }, 500);
  return json({ success: true, matched: Boolean(matchedBatchId), batchId: matchedBatchId });
}

async function syncAll(req: Request) {
  const expected = Deno.env.get("EMAIL_REPLY_V2_CRON_SECRET");
  const supplied = req.headers.get("x-email-reply-v2-secret");
  if (!expected || !supplied || supplied !== expected) return json({ error: "Scheduled sync authorization failed." }, 401);
  const admin = serviceClient();
  const { data: connections, error } = await admin.from("email_reply_connections_v2").select("id")
    .eq("status", "CONNECTED").in("provider", ["GMAIL", "OUTLOOK"]);
  if (error) return json({ error: "Unable to load mailbox connections." }, 500);
  const results = [];
  for (const connection of connections || []) {
    const response = await syncConnection({ admin, profileId: "" }, connection.id);
    results.push({ connectionId: connection.id, status: response.status, ...(await response.json()) });
  }
  return json({ success: true, connections: results.length, results });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("code")) return oauthCallback(url);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    if (body.action === "sync_all") return syncAll(req);
    const context = await requireAdmin(req);
    if (context instanceof Response) return context;
    if (body.action === "start") {
      if (!["GMAIL", "OUTLOOK"].includes(body.provider)) return json({ error: "Choose Gmail or Outlook." }, 400);
      return startOauth(body.provider, context);
    }
    if (body.action === "sync" && typeof body.connectionId === "string") {
      const mailboxEmail = typeof body.mailboxEmail === "string" ? body.mailboxEmail : undefined;
      return syncConnection(context, body.connectionId, mailboxEmail);
    }
    if (body.action === "disconnect" && typeof body.connectionId === "string") return disconnectConnection(context, body.connectionId);
    if (body.action === "test") return runMatchingTest(context);
    return json({ error: "Invalid action." }, 400);
  } catch (error) {
    console.error("email-reply-sync-v2", error);
    return json({ error: errorMessage(error, "Unable to process the request.") }, 400);
  }
});
