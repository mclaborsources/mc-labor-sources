-- Raymond import workflow: preserve employee status on update, week-scoped assignment conflicts

ALTER TABLE data_import_runs
  ADD COLUMN IF NOT EXISTS week_start_date date,
  ADD COLUMN IF NOT EXISTS week_end_date date,
  ADD COLUMN IF NOT EXISTS conflict_count int NOT NULL DEFAULT 0;

-- Returns true when assignment date range overlaps [p_week_start, p_week_end]
CREATE OR REPLACE FUNCTION public.assignment_overlaps_week(
  p_assigned_date date,
  p_end_date date,
  p_week_start date,
  p_week_end date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_assigned_date <= p_week_end
    AND coalesce(p_end_date, p_week_end) >= p_week_start;
$$;

-- Preserve manual Inactive on employee update when status omitted from import row
CREATE OR REPLACE FUNCTION public.import_employees_batch(p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_run_id uuid;
  v_row jsonb;
  v_i int := 0;
  v_results jsonb := '[]'::jsonb;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_master_id text;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_position text;
  v_pay numeric;
  v_bill numeric;
  v_status employee_status;
  v_existing uuid;
  v_new_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_user_id := public.get_my_user_id();

  IF NOT p_dry_run THEN
    INSERT INTO data_import_runs (import_type, imported_by, pasted_count, dry_run)
    VALUES ('EMPLOYEE', v_user_id, jsonb_array_length(p_rows), false)
    RETURNING id INTO v_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    v_master_id := public.nullif_import_text(v_row->>'master_employee_id');
    v_first := public.nullif_import_text(v_row->>'first_name');
    v_last := public.nullif_import_text(v_row->>'last_name');
    v_email := public.nullif_import_text(v_row->>'email');
    v_phone := public.nullif_import_text(v_row->>'phone');
    v_position := public.nullif_import_text(v_row->>'position');
    v_pay := nullif(regexp_replace(coalesce(public.nullif_import_text(v_row->>'hourly_rate'), ''), '[$,]', '', 'g'), '')::numeric;
    v_bill := nullif(regexp_replace(coalesce(public.nullif_import_text(v_row->>'bill_rate'), ''), '[$,]', '', 'g'), '')::numeric;
    v_status := public.normalize_import_status(v_row->>'status', 'ACTIVE')::employee_status;

    IF v_master_id IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Missing Employee ID');
      CONTINUE;
    END IF;
    IF v_first IS NULL OR v_last IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'First and last name are required');
      CONTINUE;
    END IF;
    IF NOT public.is_valid_email(v_email) THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid email');
      CONTINUE;
    END IF;
    IF v_pay IS NOT NULL AND v_pay < 0 THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid pay rate');
      CONTINUE;
    END IF;
    IF v_bill IS NOT NULL AND v_bill < 0 THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid bill rate');
      CONTINUE;
    END IF;

    SELECT id INTO v_existing FROM employees WHERE master_employee_id = v_master_id LIMIT 1;

    IF v_existing IS NULL THEN
      IF p_dry_run THEN
        v_created := v_created + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Employee will be created');
      ELSE
        INSERT INTO employees (master_employee_id, first_name, last_name, email, phone, position, hourly_rate, bill_rate, status)
        VALUES (v_master_id, v_first, v_last, v_email, v_phone, v_position, v_pay, v_bill, v_status)
        RETURNING id INTO v_new_id;
        v_created := v_created + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Employee created', jsonb_build_object('id', v_new_id));
      END IF;
    ELSE
      IF p_dry_run THEN
        v_updated := v_updated + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'update', 'Employee will be updated');
      ELSE
        UPDATE employees SET
          first_name = v_first, last_name = v_last, email = v_email, phone = v_phone,
          position = v_position, hourly_rate = coalesce(v_pay, hourly_rate), bill_rate = coalesce(v_bill, bill_rate),
          status = CASE
            WHEN v_row ? 'status' AND public.nullif_import_text(v_row->>'status') IS NOT NULL
            THEN v_status
            ELSE employees.status
          END,
          updated_at = now()
        WHERE id = v_existing;
        v_updated := v_updated + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'update', 'Employee updated', jsonb_build_object('id', v_existing));
      END IF;
    END IF;
  END LOOP;

  IF NOT p_dry_run AND v_run_id IS NOT NULL THEN
    UPDATE data_import_runs SET
      created_count = v_created, updated_count = v_updated, skipped_count = v_skipped, failed_count = v_failed,
      summary = jsonb_build_object('results', v_results)
    WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object(
    'dryRun', p_dry_run, 'pasted', v_i, 'created', v_created, 'updated', v_updated,
    'skipped', v_skipped, 'failed', v_failed, 'results', v_results, 'runId', v_run_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.import_assignments_batch(jsonb, boolean, jsonb);

CREATE OR REPLACE FUNCTION public.import_assignments_batch(
  p_rows jsonb,
  p_dry_run boolean DEFAULT true,
  p_resolutions jsonb DEFAULT '[]'::jsonb,
  p_week_start date DEFAULT NULL,
  p_week_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_run_id uuid;
  v_row jsonb;
  v_i int := 0;
  v_results jsonb := '[]'::jsonb;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_conflicts int := 0;
  v_master_emp text;
  v_master_cust text;
  v_master_job text;
  v_emp_id uuid;
  v_cust_id uuid;
  v_site_id uuid;
  v_new_job_name text;
  v_active_id uuid;
  v_active_job text;
  v_resolution jsonb;
  v_action text;
  v_old_end date;
  v_new_start date;
  v_new_assignment uuid;
  v_week_start date;
  v_week_end date;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_user_id := public.get_my_user_id();

  v_week_start := coalesce(p_week_start, date_trunc('week', current_date)::date);
  v_week_end := coalesce(p_week_end, (v_week_start + interval '6 days')::date);

  IF NOT p_dry_run THEN
    INSERT INTO data_import_runs (
      import_type, imported_by, pasted_count, dry_run,
      week_start_date, week_end_date
    )
    VALUES (
      'ASSIGNMENT', v_user_id, jsonb_array_length(p_rows), false,
      v_week_start, v_week_end
    )
    RETURNING id INTO v_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    v_master_emp := public.nullif_import_text(v_row->>'master_employee_id');
    v_master_cust := public.nullif_import_text(v_row->>'master_customer_id');
    v_master_job := public.nullif_import_text(v_row->>'master_job_id');

    IF v_master_emp IS NULL OR v_master_cust IS NULL OR v_master_job IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Employee ID, Customer ID, and Job ID are required');
      CONTINUE;
    END IF;

    SELECT id INTO v_emp_id FROM employees WHERE master_employee_id = v_master_emp LIMIT 1;
    SELECT id INTO v_cust_id FROM customers WHERE master_customer_id = v_master_cust LIMIT 1;
    SELECT id, name INTO v_site_id, v_new_job_name FROM job_sites WHERE master_job_id = v_master_job LIMIT 1;

    IF v_emp_id IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Employee not found: ' || v_master_emp);
      CONTINUE;
    END IF;
    IF v_cust_id IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Customer not found: ' || v_master_cust);
      CONTINUE;
    END IF;
    IF v_site_id IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Job not found: ' || v_master_job);
      CONTINUE;
    END IF;

    SELECT ja.id, js.name INTO v_active_id, v_active_job
    FROM job_assignments ja
    JOIN job_sites js ON js.id = ja.job_site_id
    WHERE ja.employee_id = v_emp_id
      AND ja.job_site_id IS DISTINCT FROM v_site_id
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE', 'COMPLETED')
      AND public.assignment_overlaps_week(ja.assigned_date, ja.end_date, v_week_start, v_week_end)
    LIMIT 1;

    IF v_active_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM job_assignments
      WHERE employee_id = v_emp_id AND job_site_id = v_site_id
        AND status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    ) THEN
      v_conflicts := v_conflicts + 1;
      SELECT r INTO v_resolution FROM jsonb_array_elements(p_resolutions) r WHERE (r->>'row')::int = v_i LIMIT 1;
      v_action := coalesce(v_resolution->>'action', '');

      IF p_dry_run AND (v_resolution IS NULL OR v_action = '') THEN
        v_results := v_results || public.import_row_result(
          v_i, 'conflict', 'conflict',
          'Employee already assigned to ' || coalesce(v_active_job, 'another job') || ' during selected week. Choose Skip or Move.',
          jsonb_build_object(
            'currentJob', v_active_job,
            'newJob', coalesce(v_new_job_name, v_master_job),
            'weekStart', v_week_start::text,
            'weekEnd', v_week_end::text
          )
        );
        CONTINUE;
      END IF;

      IF v_action = 'skip' OR (p_dry_run AND v_action = '') THEN
        v_skipped := v_skipped + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'skip', 'Row skipped');
        CONTINUE;
      END IF;

      IF v_action = 'move' THEN
        BEGIN
          v_old_end := nullif(trim(v_resolution->>'old_end_date'), '')::date;
          v_new_start := nullif(trim(v_resolution->>'new_start_date'), '')::date;
        EXCEPTION WHEN OTHERS THEN
          v_failed := v_failed + 1;
          v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid move dates');
          CONTINUE;
        END;

        IF v_old_end IS NULL OR v_new_start IS NULL THEN
          v_failed := v_failed + 1;
          v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Move requires both end date for current assignment and start date for new assignment');
          CONTINUE;
        END IF;

        IF p_dry_run THEN
          v_created := v_created + 1;
          v_results := v_results || public.import_row_result(v_i, 'ready', 'move', 'Will end current assignment and create new');
          CONTINUE;
        END IF;

        UPDATE job_assignments SET status = 'COMPLETED', end_date = v_old_end, updated_at = now() WHERE id = v_active_id;
        INSERT INTO job_assignments (employee_id, customer_id, job_site_id, assigned_date, status, master_assignment_id)
        VALUES (v_emp_id, v_cust_id, v_site_id, v_new_start, 'ACTIVE', public.nullif_import_text(v_row->>'master_assignment_id'))
        RETURNING id INTO v_new_assignment;
        v_created := v_created + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'move', 'Assignment moved', jsonb_build_object('id', v_new_assignment));
        CONTINUE;
      END IF;

      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Unresolved assignment conflict');
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM job_assignments WHERE employee_id = v_emp_id AND job_site_id = v_site_id
        AND status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    ) THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || public.import_row_result(v_i, 'ready', 'skip', 'Employee already assigned to this job');
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_created := v_created + 1;
      v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Assignment will be created');
    ELSE
      INSERT INTO job_assignments (employee_id, customer_id, job_site_id, assigned_date, status, master_assignment_id)
      VALUES (
        v_emp_id, v_cust_id, v_site_id,
        coalesce(public.parse_import_date(v_row->>'assigned_date'), current_date),
        'ACTIVE', public.nullif_import_text(v_row->>'master_assignment_id')
      ) RETURNING id INTO v_new_assignment;
      v_created := v_created + 1;
      v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Assignment created', jsonb_build_object('id', v_new_assignment));
    END IF;
  END LOOP;

  IF NOT p_dry_run AND v_run_id IS NOT NULL THEN
    UPDATE data_import_runs SET
      created_count = v_created, updated_count = v_updated, skipped_count = v_skipped, failed_count = v_failed,
      conflict_count = v_conflicts,
      summary = jsonb_build_object('results', v_results)
    WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object(
    'dryRun', p_dry_run, 'pasted', v_i, 'created', v_created, 'updated', v_updated,
    'skipped', v_skipped, 'failed', v_failed, 'conflicts', v_conflicts,
    'results', v_results, 'runId', v_run_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_employees_batch(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_assignments_batch(jsonb, boolean, jsonb, date, date) TO authenticated;
