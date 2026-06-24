-- Workbook dry-run preview: treat master IDs from earlier sheets in the same upload as known

CREATE OR REPLACE FUNCTION public.import_id_in_pending(p_id text, p_pending jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(trim(p_id), '') <> ''
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(coalesce(p_pending, '[]'::jsonb)) AS e(value)
      WHERE trim(e.value) = trim(p_id)
    );
$$;

DROP FUNCTION IF EXISTS public.import_job_sites_batch(jsonb, boolean);

CREATE OR REPLACE FUNCTION public.import_job_sites_batch(
  p_rows jsonb,
  p_dry_run boolean DEFAULT true,
  p_pending_customer_ids jsonb DEFAULT '[]'::jsonb
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
  v_failed int := 0;
  v_master_job text;
  v_master_customer text;
  v_name text;
  v_customer_uuid uuid;
  v_existing uuid;
  v_site_id uuid;
  v_slot int;
  v_foreman jsonb;
  v_start date;
  v_status job_site_status;
  v_foreman_name text;
  v_foreman_email text;
  v_foreman_phone text;
  v_customer_pending boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_user_id := public.get_my_user_id();

  IF NOT p_dry_run THEN
    INSERT INTO data_import_runs (import_type, imported_by, pasted_count, dry_run)
    VALUES ('JOB', v_user_id, jsonb_array_length(p_rows), false) RETURNING id INTO v_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    v_master_job := public.nullif_import_text(v_row->>'master_job_id');
    v_master_customer := public.nullif_import_text(v_row->>'master_customer_id');
    v_name := public.nullif_import_text(v_row->>'name');

    IF v_master_job IS NULL OR v_name IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Job ID and Job Name are required');
      CONTINUE;
    END IF;

    IF v_master_customer IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Customer ID is required to link job');
      CONTINUE;
    END IF;

    SELECT id INTO v_customer_uuid FROM customers WHERE master_customer_id = v_master_customer LIMIT 1;
    v_customer_pending := p_dry_run
      AND v_customer_uuid IS NULL
      AND public.import_id_in_pending(v_master_customer, p_pending_customer_ids);

    IF v_customer_uuid IS NULL AND NOT v_customer_pending THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Customer not found: ' || v_master_customer);
      CONTINUE;
    END IF;

    v_start := public.parse_import_date(v_row->>'start_date');
    IF public.nullif_import_text(v_row->>'start_date') IS NOT NULL AND v_start IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid start date');
      CONTINUE;
    END IF;

    v_status := public.normalize_import_status(v_row->>'status', 'ACTIVE')::job_site_status;
    v_foreman_name := coalesce(
      public.nullif_import_text(v_row->>'foreman_name'),
      public.nullif_import_text(v_row->'foremen'->'0'->>'name')
    );
    v_foreman_email := coalesce(
      public.nullif_import_text(v_row->>'foreman_email'),
      public.nullif_import_text(v_row->'foremen'->'0'->>'email')
    );
    v_foreman_phone := coalesce(
      public.nullif_import_text(v_row->>'foreman_phone'),
      public.nullif_import_text(v_row->'foremen'->'0'->>'cell'),
      public.nullif_import_text(v_row->'foremen'->'0'->>'office_phone')
    );

    SELECT id INTO v_existing FROM job_sites WHERE master_job_id = v_master_job LIMIT 1;

    IF v_existing IS NULL THEN
      IF p_dry_run THEN
        v_created := v_created + 1;
        v_results := v_results || public.import_row_result(
          v_i, 'ready', 'create',
          CASE WHEN v_customer_pending THEN 'Job will be created (customer from workbook)' ELSE 'Job will be created' END
        );
      ELSE
        INSERT INTO job_sites (
          master_job_id, customer_id, name, address, city, state, zip_code, start_date, status,
          foreman_name, foreman_email, foreman_phone
        ) VALUES (
          v_master_job, v_customer_uuid, v_name,
          coalesce(public.nullif_import_text(v_row->>'street'), '—'),
          public.nullif_import_text(v_row->>'city'),
          public.nullif_import_text(v_row->>'state'),
          public.nullif_import_text(v_row->>'zip'),
          v_start, v_status,
          v_foreman_name, v_foreman_email, v_foreman_phone
        ) RETURNING id INTO v_site_id;
        v_created := v_created + 1;
      END IF;
    ELSE
      IF p_dry_run THEN
        v_updated := v_updated + 1;
        v_results := v_results || public.import_row_result(v_i, 'ready', 'update', 'Job will be updated');
      ELSE
        UPDATE job_sites SET
          customer_id = v_customer_uuid, name = v_name,
          address = coalesce(public.nullif_import_text(v_row->>'street'), address),
          city = coalesce(public.nullif_import_text(v_row->>'city'), city),
          state = coalesce(public.nullif_import_text(v_row->>'state'), state),
          zip_code = coalesce(public.nullif_import_text(v_row->>'zip'), zip_code),
          start_date = coalesce(v_start, start_date),
          status = v_status,
          foreman_name = coalesce(v_foreman_name, foreman_name),
          foreman_email = coalesce(v_foreman_email, foreman_email),
          foreman_phone = coalesce(v_foreman_phone, foreman_phone),
          updated_at = now()
        WHERE id = v_existing;
        v_site_id := v_existing;
        v_updated := v_updated + 1;
      END IF;
      v_site_id := coalesce(v_site_id, v_existing);
    END IF;

    IF NOT p_dry_run AND v_site_id IS NOT NULL THEN
      FOR v_slot IN 1..20 LOOP
        v_foreman := v_row->'foremen'->((v_slot - 1)::text);
        IF v_foreman IS NULL OR v_foreman = 'null'::jsonb THEN CONTINUE; END IF;
        IF coalesce(public.nullif_import_text(v_foreman->>'name'), '') = '' THEN CONTINUE; END IF;
        INSERT INTO job_site_contacts (job_site_id, slot_number, name, email, cell, office_phone)
        VALUES (
          v_site_id, v_slot,
          public.nullif_import_text(v_foreman->>'name'),
          public.nullif_import_text(v_foreman->>'email'),
          public.nullif_import_text(v_foreman->>'cell'),
          public.nullif_import_text(v_foreman->>'office_phone')
        )
        ON CONFLICT (job_site_id, slot_number) DO UPDATE SET
          name = EXCLUDED.name, email = EXCLUDED.email, cell = EXCLUDED.cell,
          office_phone = EXCLUDED.office_phone, updated_at = now();
      END LOOP;
    END IF;
  END LOOP;

  IF NOT p_dry_run AND v_run_id IS NOT NULL THEN
    UPDATE data_import_runs SET created_count = v_created, updated_count = v_updated, failed_count = v_failed,
      summary = jsonb_build_object('results', v_results) WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object('dryRun', p_dry_run, 'pasted', v_i, 'created', v_created, 'updated', v_updated,
    'failed', v_failed, 'results', v_results, 'runId', v_run_id);
END;
$$;

DROP FUNCTION IF EXISTS public.import_assignments_batch(jsonb, boolean, jsonb, date, date);

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

    SELECT ja.id, js.name INTO v_active_id, v_active_job
    FROM job_assignments ja
    JOIN job_sites js ON js.id = ja.job_site_id
    WHERE ja.employee_id = v_emp_id
      AND (v_site_id IS NULL OR ja.job_site_id IS DISTINCT FROM v_site_id)
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE', 'COMPLETED')
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

GRANT EXECUTE ON FUNCTION public.import_job_sites_batch(jsonb, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_assignments_batch(jsonb, boolean, jsonb, date, date, jsonb, jsonb, jsonb) TO authenticated;
