CREATE TABLE public.help_rule_topics (
  id text PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('Rules', 'Help', 'Tips')),
  content text NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.help_rule_topics ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_rule_topics TO authenticated;

CREATE POLICY help_rule_topics_read
  ON public.help_rule_topics FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY help_rule_topics_admin_write
  ON public.help_rule_topics FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.help_rule_topics (id, title, category, content) VALUES
  (
    'portal-access-rules',
    'Portal Access Rules',
    'Rules',
    $content$Active employees included in an assignment import receive portal access automatically if they do not already have an account and have a valid cell number. This includes existing employee records. New employees imported into the system also receive access.

Username: first 3 letters of the first name, lowercase (for example, mar). No numbers are added.

Initial password: the employee’s cell number, digits only, including the country code if present in the imported number.

Default tabs: Home, Assignments / Site Information, and Messages. Other optional tabs remain disabled.

The same username or the same password may be used by different employees, but an identical username and password combination is blocked.

Existing accounts, passwords, and access settings are preserved on re-import. Missing or invalid cell numbers are reported in the import results for manual follow-up.

A cell number is predictable. Treat it as an initial password and replace it with a strong private password.$content$
  ),
  (
    'next-week-rules',
    'Next Work Week Rules',
    'Rules',
    $content$Only employees highlighted in the current work week can preview their own next-week assignments: their customer/job changed, or they had no assignment in the previous week.

Access expires at 12:00 AM Saturday, Eastern Time. The previewed assignments then appear under This Week.

Eligibility is checked again for the new week using its assignments. An old permission never carries forward; only employees highlighted in the new week receive its next-week preview.

This rule does not change previous-week access or enable a disabled portal account.$content$
  ),
  (
    'timesheet-sending-rules',
    'Timesheet Sending Rules',
    'Rules',
    $content$1. Submit all approved timesheets together whenever possible.

2. Send a timesheet separately only when a correction or customer-requested change requires it.

3. A timesheet with previous delivery history must be authorized using Resend before another submission.

4. Resend authorization requires pass code 3360.$content$
  )
ON CONFLICT (id) DO NOTHING;
