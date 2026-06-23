-- Raymond master-system export compatibility (NULL literals, dates, status)

CREATE OR REPLACE FUNCTION public.nullif_import_text(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(trim(p_value), '') = '' THEN NULL
    WHEN upper(trim(p_value)) IN ('NULL', 'N/A', 'NA', '#N/A', '-', 'NONE') THEN NULL
    ELSE trim(p_value)
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_import_status(p_status text, p_default text DEFAULT 'ACTIVE')
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := upper(trim(coalesce(p_status, '')));
BEGIN
  IF v IN ('', 'NULL', 'N/A', 'NA', '#N/A') THEN RETURN p_default; END IF;
  IF v IN ('ACTIVE', 'INACTIVE') THEN RETURN v; END IF;
  IF v IN ('A', 'ACT', 'ENABLED', 'AVAILABLE') THEN RETURN 'ACTIVE'; END IF;
  IF v IN ('I', 'INACT', 'DISABLED') THEN RETURN 'INACTIVE'; END IF;
  RETURN p_default;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_email(p_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public.nullif_import_text(p_email) IS NULL
    OR public.nullif_import_text(p_email) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';
$$;

CREATE OR REPLACE FUNCTION public.parse_import_date(p_value text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := public.nullif_import_text(p_value);
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN split_part(v, ' ', 1)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Patch employee import to sanitize NULL literals
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
          status = v_status, updated_at = now()
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

-- Patch job import: datetime start dates + foreman from JSON top-level fields
CREATE OR REPLACE FUNCTION public.import_job_sites_batch(p_rows jsonb, p_dry_run boolean DEFAULT true)
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
    IF v_customer_uuid IS NULL THEN
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
        v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Job will be created');
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
