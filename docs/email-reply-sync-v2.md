# Email Reply Sync V2

This is an isolated test implementation. It does not replace or delete the existing customer email evidence workflow.

## What V2 does

- Connects one or more Gmail and Outlook/Microsoft 365 mailboxes through provider OAuth.
- Stores OAuth tokens encrypted with AES-GCM using an Edge Function secret.
- Fetches recent Inbox messages when an administrator clicks **Sync now**.
- New customer timesheet emails use a unique receive-only `Reply-To` plus-address. Its random tag is also part of the outbound `Message-ID`, so replies can be matched to the sent batch even if the mail client omits thread headers.
- Existing messages continue to match when `In-Reply-To` or `References` identifies a recorded `timesheet_delivery_batches.smtp_message_id`. It never falls back to subject matching, which can confuse unrelated conversations that reuse a subject.
- Deduplicates messages by provider connection and provider message ID.
- Ignores messages without a matching unique reply address or thread header instead of guessing by subject or placing unrelated mail in the V2 replies list.
- Provides a safe synthetic matching test that never reads a real mailbox.

Outlook routing note: the SMTP sender mailbox must accept Exchange Online plus-addresses. Exchange enables plus addressing by default, but an administrator can disable it. Existing sent messages are unchanged; the unique Reply-To applies only to messages sent after the sender function is deployed.

## Required Supabase secrets

Set these with the Supabase CLI or in the project dashboard's Edge Function secrets:

```text
EMAIL_REPLY_V2_TOKEN_KEY=<a long random secret of at least 24 characters>
EMAIL_REPLY_V2_CRON_SECRET=<a different long random secret>
EMAIL_REPLY_V2_APP_URL=https://your-admin-app.example.com
GMAIL_OAUTH_CLIENT_ID=<Google OAuth client ID>
GMAIL_OAUTH_CLIENT_SECRET=<Google OAuth client secret>
OUTLOOK_OAUTH_CLIENT_ID=<Microsoft Entra application client ID>
OUTLOOK_OAUTH_CLIENT_SECRET=<Microsoft Entra application client secret>
```

Never prefix these values with `NEXT_PUBLIC_` and never commit their real values.

## OAuth callback URLs

Register the following URLs with the providers, replacing the project URL:

```text
https://<project-ref>.supabase.co/functions/v1/email-reply-sync-v2?provider=gmail
https://<project-ref>.supabase.co/functions/v1/email-reply-sync-v2?provider=outlook
```

Google needs the Gmail API enabled and the OAuth scope `gmail.readonly`. Microsoft needs delegated `User.Read` and `Mail.Read`, plus `offline_access`.

## Testing order

1. Deploy `deliver-signed-timesheet` and `email-reply-sync-v2`.
2. Open **Email Reply Sync V2** in the admin navigation.
3. Run the safe matching test. It creates a clearly marked synthetic reply against the latest sent email.
4. Configure one developer Gmail or Outlook mailbox and complete OAuth.
5. Send a real reply to a timesheet email, then click **Sync now**.
6. Confirm that the reply is matched to the expected email batch. New emails match by their unique Reply-To address; older messages match by thread headers.

Automatic scheduling should only be enabled after manual sync has been verified with the production mailbox. The `sync` action is ready to be called by a protected scheduled job.

After manual testing succeeds, schedule an HTTP `POST` to the Edge Function every five minutes with this JSON body:

```json
{"action":"sync_all"}
```

Send the `EMAIL_REPLY_V2_CRON_SECRET` value in the `x-email-reply-v2-secret` header. The scheduled endpoint synchronizes all connected Gmail and Outlook mailboxes. Keep this header value in the scheduler's secret storage, not in application code.
