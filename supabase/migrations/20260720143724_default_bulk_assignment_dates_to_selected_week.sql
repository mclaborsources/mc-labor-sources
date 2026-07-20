-- Weekly workbook imports always cover the full selected Saturday-Friday week.
-- Keep the existing import_assignments_batch behavior for single-sheet paste.

CREATE OR REPLACE FUNCTION public.import_weekly_assignments_batch(
  p_rows jsonb,
  p_dry_run boolean DEFAULT true,
  p_resolutions jsonb DEFAULT '[]'::jsonb,
  p_week_start date DEFAULT NULL,
  p_week_end date DEFAULT NULL,
  p_pending_employee_ids jsonb DEFAULT '[]'::jsonb,
  p_pending_customer_ids jsonb DEFAULT '[]'::jsonb,
  p_pending_job_ids jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_week_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'Week start and week end dates are required';
  END IF;

  IF p_week_end <> p_week_start + 6 THEN
    RAISE EXCEPTION 'Assignment import week must run from Saturday through Friday';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      (row_value - 'assigned_date' - 'end_date')
      || jsonb_build_object(
        'assigned_date', p_week_start::text,
        'end_date', p_week_end::text
      )
      ORDER BY row_number
    ),
    '[]'::jsonb
  )
  INTO v_week_rows
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS input_rows(row_value, row_number);

  v_result := public.import_assignments_batch(
    v_week_rows,
    p_dry_run,
    p_resolutions,
    p_week_start,
    p_week_end,
    p_pending_employee_ids,
    p_pending_customer_ids,
    p_pending_job_ids
  );

  IF NOT p_dry_run THEN
    UPDATE job_assignments AS assignment
    SET
      assigned_date = p_week_start,
      end_date = p_week_end,
      updated_at = now()
    FROM employees AS employee, job_sites AS job_site
    WHERE assignment.employee_id = employee.id
      AND assignment.job_site_id = job_site.id
      AND assignment.assigned_date = p_week_start
      AND assignment.status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_week_rows) AS imported(row_value)
        WHERE public.nullif_import_text(imported.row_value->>'master_employee_id') = employee.master_employee_id
          AND public.nullif_import_text(imported.row_value->>'master_job_id') = job_site.master_job_id
      );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.import_weekly_assignments_batch(jsonb, boolean, jsonb, date, date, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_weekly_assignments_batch(jsonb, boolean, jsonb, date, date, jsonb, jsonb, jsonb) TO authenticated;
