# Email Reply Sync V2

This is an isolated test implementation. It does not replace or delete the existing customer email evidence workflow.

## What V2 does

- Connects one or more Gmail and Outlook/Microsoft 365 mailboxes through provider OAuth.
- Stores OAuth tokens encrypted with AES-GCM using an Edge Function secret.
- Fetches recent Inbox messages when an administrator clicks **Sync now**.
- Matches replies to `timesheet_delivery_batches.smtp_message_id` using `In-Reply-To` and `References`.
- Deduplicates messages by provider connection and provider message ID.
- Keeps uncertain messages in an unmatched queue rather than assigning them to the wrong timesheet email.
- Provides a safe synthetic matching test that never reads a real mailbox.

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

1. Apply the V2 migration and deploy only `email-reply-sync-v2`.
2. Open **Email Reply Sync V2** in the admin navigation.
3. Run the safe matching test. It creates a clearly marked synthetic reply against the latest sent email.
4. Configure one developer Gmail or Outlook mailbox and complete OAuth.
5. Send a real reply to a timesheet email, then click **Sync now**.
6. Confirm that the reply is matched to the expected email batch or appears as unmatched.

Automatic scheduling should only be enabled after manual sync has been verified with the production mailbox. The `sync` action is ready to be called by a protected scheduled job.

After manual testing succeeds, schedule an HTTP `POST` to the Edge Function every five minutes with this JSON body:

```json
{"action":"sync_all"}
```

Send the `EMAIL_REPLY_V2_CRON_SECRET` value in the `x-email-reply-v2-secret` header. The scheduled endpoint synchronizes all connected Gmail and Outlook mailboxes. Keep this header value in the scheduler's secret storage, not in application code.
