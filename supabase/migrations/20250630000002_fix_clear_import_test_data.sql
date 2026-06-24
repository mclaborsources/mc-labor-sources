-- Supabase requires DELETE to include a WHERE clause (pg_safeupdate).

CREATE OR REPLACE FUNCTION public.clear_import_test_data(p_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notifications int := 0;
  v_attendance int := 0;
  v_timesheets int := 0;
  v_job_orders int := 0;
  v_assignments int := 0;
  v_supervisor_links int := 0;
  v_job_sites int := 0;
  v_portal_users int := 0;
  v_customers int := 0;
  v_employees int := 0;
  v_import_runs int := 0;
  v_safety_bulletins int := 0;
  v_email_log int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF trim(coalesce(p_confirmation, '')) <> 'RESET-IMPORT-DATA' THEN
    RAISE EXCEPTION 'Invalid confirmation phrase';
  END IF;

  WITH deleted AS (
    DELETE FROM notifications WHERE employee_id IS NOT NULL RETURNING 1
  )
  SELECT count(*)::int INTO v_notifications FROM deleted;

  WITH deleted AS (DELETE FROM attendance_logs WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_attendance FROM deleted;

  WITH deleted AS (DELETE FROM timesheets WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_timesheets FROM deleted;

  WITH deleted AS (DELETE FROM job_orders WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_job_orders FROM deleted;

  WITH deleted AS (DELETE FROM job_assignments WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_assignments FROM deleted;

  WITH deleted AS (DELETE FROM supervisor_job_sites WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_supervisor_links FROM deleted;

  DELETE FROM safety_bulletin_recipients WHERE true;

  WITH deleted AS (DELETE FROM safety_bulletins WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_safety_bulletins FROM deleted;

  WITH deleted AS (DELETE FROM job_sites WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_job_sites FROM deleted;

  WITH deleted AS (
    DELETE FROM users WHERE role IN ('WORKER', 'CUSTOMER') RETURNING 1
  )
  SELECT count(*)::int INTO v_portal_users FROM deleted;

  WITH deleted AS (DELETE FROM customers WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_customers FROM deleted;

  WITH deleted AS (DELETE FROM employees WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_employees FROM deleted;

  WITH deleted AS (DELETE FROM data_import_runs WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_import_runs FROM deleted;

  WITH deleted AS (DELETE FROM email_delivery_log WHERE true RETURNING 1)
  SELECT count(*)::int INTO v_email_log FROM deleted;

  RETURN jsonb_build_object(
    'cleared', true,
    'counts', jsonb_build_object(
      'notifications', v_notifications,
      'attendanceLogs', v_attendance,
      'timesheets', v_timesheets,
      'jobOrders', v_job_orders,
      'assignments', v_assignments,
      'supervisorJobSites', v_supervisor_links,
      'jobSites', v_job_sites,
      'portalUsers', v_portal_users,
      'customers', v_customers,
      'employees', v_employees,
      'importRuns', v_import_runs,
      'safetyBulletins', v_safety_bulletins,
      'emailDeliveryLog', v_email_log
    )
  );
END;
$$;
