-- Timesheets may only be signed by an active supervisor assigned to the job site.
-- The foreman_* column names are retained for backward compatibility.

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
  IF public.get_my_role() IS DISTINCT FROM 'SUPERVISOR' THEN
    RAISE EXCEPTION 'Only supervisors can sign timesheets';
  END IF;

  IF p_foreman_name IS NULL OR trim(p_foreman_name) = '' THEN
    RAISE EXCEPTION 'Supervisor name is required';
  END IF;
  IF p_signature_image_url IS NULL OR trim(p_signature_image_url) = '' THEN
    RAISE EXCEPTION 'Signature image URL is required';
  END IF;

  SELECT *
  INTO v_timesheet
  FROM timesheets
  WHERE id = p_timesheet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF NOT public.is_supervisor_of_job_site(v_timesheet.job_site_id) THEN
    RAISE EXCEPTION 'Not authorized to sign this timesheet';
  END IF;

  IF v_timesheet.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'Timesheet has already been signed';
  END IF;

  INSERT INTO timesheet_signatures (
    timesheet_id,
    foreman_name,
    foreman_email,
    signature_image_url,
    signed_at
  )
  VALUES (
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

REVOKE ALL ON FUNCTION public.sign_timesheet(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sign_timesheet(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sign_timesheet(uuid, text, text, text) TO authenticated;
