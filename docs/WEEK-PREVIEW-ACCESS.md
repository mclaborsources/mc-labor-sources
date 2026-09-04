# Highlighted employee next-week preview

Migration `supabase/migrations/20260904152251_highlighted_employee_week_preview.sql`
was deployed to project `sjekdmdrsncxbemmwtwh` on September 4, 2026. Its migration
record, both restrictive policies, and function privileges were verified live.
The migration also passed isolated PostgreSQL (PGlite) tests. No new Edge Function
or cron job is needed. Publish the updated admin/mobile apps next, then perform
an authenticated employee smoke test. The advisor comparison found no new
security notices; existing unrelated notices remain unchanged.

The database determines the current Saturday-Friday workweek in America/New_York.
An active employee with Assignments enabled qualifies if any current-week
assignment has no matching customer AND job site in the previous week. This
matches the admin highlighting, including employees absent from the previous week
and single-day assignments with no end date. Existing statuses are treated the
same way as the admin highlight filter.

Access is recalculated rather than stored as a permanent flag. At Saturday 00:00
Eastern Time, the previous preview becomes current. Only employees highlighted
for that new week qualify to preview its following week. Importing/updating that
week's assignments therefore changes eligibility automatically. The legacy
`mobile_next_week_enabled` field is no longer an access authority; the admin
profile displays automatic access instead of a permanent override.

The API returns the office week, expiry, server time, and effective permission.
Mobile refreshes on resume and every minute; a server-relative timer clears the
old view at rollover and returns to This Week. Fetch failures remove the preview
and cached list. Restrictive RLS also checks future assignment and job-order
reads, including direct links. Historical/previous-week rules are unchanged.

Verification:

```powershell
npm.cmd install --prefix .tmp/preview-sql-tests --no-save --package-lock=false @electric-sql/pglite@0.5.8
node --test scripts/test-week-preview.mjs
```

After deployment, test a highlighted employee and an unchanged employee, including
direct assignment links, and verify the displayed expiry is Eastern Time. Verify
a highlighted employee can see only their own next week (not the week after).
Keep the credential secret unchanged; this feature does not use or rotate it.
