# Weekly safety tip delivery setup

The tip list is maintained in `supabase/functions/_shared/safety-tips.json`. Sample entries are marked with `isSample: true`; the weekly sender skips them. Replace each title and message with approved guidance and set `isSample` to `false` before that week can be delivered.

The database migration creates an enabled Thursday 8:00 AM Eastern schedule and a five-minute Cron poller. The poller remains dormant until these two named secrets exist in Supabase Vault:

- `project_url`: `https://<your-project-ref>.supabase.co`
- `service_role_key`: the same service role key configured for the Supabase project

Deploy the database migration and function with `supabase db push` and `supabase functions deploy send-weekly-safety-tip`. Weekly tips are delivered in the worker app as safety bulletins and notification-center items; no safety-tip email is sent. Phone push alerts are sent when company push notifications are enabled and workers have registered device tokens. The Edge Function compares the request's `apikey` with `SUPABASE_SERVICE_ROLE_KEY`; do not expose that key in the admin app.

The admin schedule defaults to enabled on Thursday at 8:00 AM Eastern Time. Scheduled tips follow the ISO calendar week; week 53 uses tip 52. Sample and placeholder tips are skipped until replaced with approved guidance. Manual sends of other bulletins do not change the scheduled sequence.
