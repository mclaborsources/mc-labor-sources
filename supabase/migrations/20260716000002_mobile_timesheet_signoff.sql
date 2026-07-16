-- Allow an employee to hand their device to an on-site foreman for sign-off.
-- Delivery flags make the follow-up email/push workflow safely retryable.

ALTER TABLE timesheet_signatures
  ADD COLUMN IF NOT EXISTS customer_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS mc_labor_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_last_error text;

DROP POLICY IF EXISTS timesheet_signatures_worker_read ON timesheet_signatures;
CREATE POLICY timesheet_signatures_worker_read ON timesheet_signatures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_signatures.timesheet_id
        AND t.employee_id = public.get_my_employee_id()
    )
  );

CREATE OR REPLACE FUNCTION public.sign_timesheet(
  p_timesheet_id uuid,
  p_foreman_name text,
  p_foreman_email text,
  p_signature_image_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timesheet timesheets%ROWTYPE;
BEGIN
  IF p_foreman_name IS NULL OR trim(p_foreman_name) = '' THEN
    RAISE EXCEPTION 'Foreman name is required';
  END IF;
  IF p_signature_image_url IS NULL OR trim(p_signature_image_url) = '' THEN
    RAISE EXCEPTION 'Signature image URL is required';
  END IF;

  SELECT * INTO v_timesheet FROM timesheets WHERE id = p_timesheet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF NOT public.is_admin()
     AND NOT public.is_supervisor_of_job_site(v_timesheet.job_site_id)
     AND v_timesheet.employee_id IS DISTINCT FROM public.get_my_employee_id() THEN
    RAISE EXCEPTION 'Not authorized to sign this timesheet';
  END IF;

  IF v_timesheet.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'Timesheet has already been signed';
  END IF;

  INSERT INTO timesheet_signatures (
    timesheet_id, foreman_name, foreman_email, signature_image_url, signed_at
  ) VALUES (
    p_timesheet_id,
    trim(p_foreman_name),
    NULLIF(trim(COALESCE(p_foreman_email, '')), ''),
    trim(p_signature_image_url),
    now()
  );

  UPDATE timesheets
  SET status = 'SIGNED', updated_at = now()
  WHERE id = p_timesheet_id;

  RETURN p_timesheet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_timesheet(uuid, text, text, text) TO authenticated;
