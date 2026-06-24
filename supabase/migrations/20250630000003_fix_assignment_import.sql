-- Fix weekly assignment import:
-- 1) Default assigned_date to selected week start (not today)
-- 2) Auto-end open assignments from prior weeks before creating new ones
-- 3) Conflict detection uses open statuses only
-- 4) Row-level handling for unique constraint violations
-- 5) Admin helper to end all open assignments before import

CREATE OR REPLACE FUNCTION public.complete_all_open_assignments(
  p_week_end date,
  p_confirmation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_week_end IS NULL THEN
    RAISE EXCEPTION 'Week ending date is required';
  END IF;

  IF trim(coalesce(p_confirmation, '')) <> 'END-OPEN-ASSIGNMENTS' THEN
    RAISE EXCEPTION 'Invalid confirmation phrase';
  END IF;

  WITH updated AS (
    UPDATE job_assignments
    SET
      status = 'COMPLETED',
      end_date = coalesce(end_date, p_week_end),
      updated_at = now()
    WHERE status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
      AND true
    RETURNING 1
  )
  SELECT count(*)::int INTO v_completed FROM updated;

  RETURN jsonb_build_object(
    'completed', true,
    'count', v_completed,
    'weekEnd', p_week_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_all_open_assignments(date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_assignments_batch(
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
  v_assigned_date date;
  v_emp_pending boolean;
  v_cust_pending boolean;
  v_job_pending boolean;
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

    v_emp_pending := p_dry_run AND v_emp_id IS NULL AND public.import_id_in_pending(v_master_emp, p_pending_employee_ids);
    v_cust_pending := p_dry_run AND v_cust_id IS NULL AND public.import_id_in_pending(v_master_cust, p_pending_customer_ids);
    v_job_pending := p_dry_run AND v_site_id IS NULL AND public.import_id_in_pending(v_master_job, p_pending_job_ids);

    IF v_emp_id IS NULL AND NOT v_emp_pending THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Employee not found: ' || v_master_emp);
      CONTINUE;
    END IF;
    IF v_cust_id IS NULL AND NOT v_cust_pending THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Customer not found: ' || v_master_cust);
      CONTINUE;
    END IF;
    IF v_site_id IS NULL AND NOT v_job_pending THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Job not found: ' || v_master_job);
      CONTINUE;
    END IF;

    v_new_job_name := coalesce(
      v_new_job_name,
      public.nullif_import_text(v_row->>'job_name'),
      v_master_job
    );

    IF v_emp_id IS NULL THEN
      IF p_dry_run THEN
        v_created := v_created + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Assignment will be created (employee from workbook)');
      ELSE
        v_failed := v_failed + 1;
        v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Employee not found: ' || v_master_emp);
      END IF;
      CONTINUE;
    END IF;

    v_assigned_date := coalesce(public.parse_import_date(v_row->>'assigned_date'), v_week_start);

    SELECT ja.id, js.name INTO v_active_id, v_active_job
    FROM job_assignments ja
    JOIN job_sites js ON js.id = ja.job_site_id
    WHERE ja.employee_id = v_emp_id
      AND (v_site_id IS NULL OR ja.job_site_id IS DISTINCT FROM v_site_id)
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
      AND public.assignment_overlaps_week(ja.assigned_date, ja.end_date, v_week_start, v_week_end)
    LIMIT 1;

    IF v_active_id IS NOT NULL AND (v_site_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM job_assignments
      WHERE employee_id = v_emp_id AND job_site_id = v_site_id
        AND status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    )) THEN
      v_conflicts := v_conflicts + 1;
      SELECT r INTO v_resolution FROM jsonb_array_elements(p_resolutions) r WHERE (r->>'row')::int = v_i LIMIT 1;
      v_action := coalesce(v_resolution->>'action', '');

      IF p_dry_run AND (v_resolution IS NULL OR v_action = '') THEN
        v_results := v_results || public.import_row_result(
          v_i, 'conflict', 'conflict',
          'Employee already assigned to ' || coalesce(v_active_job, 'another job') || ' during selected week. Choose Skip or Move.',
          jsonb_build_object(
            'currentJob', v_active_job,
            'newJob', v_new_job_name,
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

        IF v_site_id IS NULL THEN
          v_failed := v_failed + 1;
          v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Job not found: ' || v_master_job);
          CONTINUE;
        END IF;

        UPDATE job_assignments SET status = 'COMPLETED', end_date = v_old_end, updated_at = now() WHERE id = v_active_id;
        BEGIN
          INSERT INTO job_assignments (employee_id, customer_id, job_site_id, assigned_date, status, master_assignment_id)
          VALUES (v_emp_id, v_cust_id, v_site_id, v_new_start, 'ACTIVE', public.nullif_import_text(v_row->>'master_assignment_id'))
          RETURNING id INTO v_new_assignment;
        EXCEPTION WHEN unique_violation THEN
          v_failed := v_failed + 1;
          v_results := v_results || public.import_row_result(
            v_i, 'error', 'error',
            'Employee still has an open assignment after move. End open assignments and retry.'
          );
          CONTINUE;
        END;
        v_created := v_created + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'move', 'Assignment moved', jsonb_build_object('id', v_new_assignment));
        CONTINUE;
      END IF;

      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Unresolved assignment conflict');
      CONTINUE;
    END IF;

    IF v_site_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM job_assignments WHERE employee_id = v_emp_id AND job_site_id = v_site_id
        AND status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    ) THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || public.import_row_result(v_i, 'ready', 'skip', 'Employee already assigned to this job');
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_created := v_created + 1;
      v_results := v_results || public.import_row_result(
        v_i, 'ready', 'create',
        CASE
          WHEN v_job_pending OR v_cust_pending THEN 'Assignment will be created (references from workbook)'
          ELSE 'Assignment will be created'
        END
      );
    ELSE
      IF v_cust_id IS NULL OR v_site_id IS NULL THEN
        v_failed := v_failed + 1;
        v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Customer or job not found for assignment');
        CONTINUE;
      END IF;

      -- Close stale open assignments from prior weeks so the one-open-per-employee rule allows this import.
      UPDATE job_assignments
      SET
        status = 'COMPLETED',
        end_date = coalesce(end_date, v_week_start - 1),
        updated_at = now()
      WHERE employee_id = v_emp_id
        AND status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
        AND NOT public.assignment_overlaps_week(assigned_date, end_date, v_week_start, v_week_end)
        AND true;

      BEGIN
        INSERT INTO job_assignments (employee_id, customer_id, job_site_id, assigned_date, status, master_assignment_id)
        VALUES (
          v_emp_id, v_cust_id, v_site_id,
          v_assigned_date,
          'ACTIVE', public.nullif_import_text(v_row->>'master_assignment_id')
        ) RETURNING id INTO v_new_assignment;
      EXCEPTION WHEN unique_violation THEN
        v_failed := v_failed + 1;
        v_results := v_results || public.import_row_result(
          v_i, 'error', 'error',
          'Employee already has an open assignment for this week. Resolve the conflict (Skip or Move) and retry.'
        );
        CONTINUE;
      END;

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
