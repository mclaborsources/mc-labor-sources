-- Master-system import: IDs, contacts, audit, import RPCs

-- ---------------------------------------------------------------------------
-- Schema extensions
-- ---------------------------------------------------------------------------

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS master_employee_id text,
  ADD COLUMN IF NOT EXISTS bill_rate numeric(10, 2);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS master_customer_id text,
  ADD COLUMN IF NOT EXISTS customer_type text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text;

UPDATE customers SET street = address WHERE street IS NULL AND address IS NOT NULL;

ALTER TABLE job_sites
  ADD COLUMN IF NOT EXISTS master_job_id text,
  ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE job_assignments
  ADD COLUMN IF NOT EXISTS master_assignment_id text,
  ADD COLUMN IF NOT EXISTS end_date date;

-- Legacy data may have multiple open assignments per employee; keep the newest and complete the rest.
WITH ranked_open_assignments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id
      ORDER BY assigned_date DESC, updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM job_assignments
  WHERE status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
)
UPDATE job_assignments ja
SET
  status = 'COMPLETED',
  end_date = COALESCE(ja.end_date, ja.assigned_date),
  updated_at = now()
FROM ranked_open_assignments r
WHERE ja.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS employees_master_employee_id_key
  ON employees (master_employee_id) WHERE master_employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_master_customer_id_key
  ON customers (master_customer_id) WHERE master_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_sites_master_job_id_key
  ON job_sites (master_job_id) WHERE master_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_assignments_one_open_per_employee
  ON job_assignments (employee_id)
  WHERE status IN ('PENDING', 'ACCEPTED', 'ACTIVE');

CREATE TABLE IF NOT EXISTS customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 10),
  first_name text,
  last_name text,
  title text,
  email text,
  cell text,
  office_phone text,
  master_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, slot_number)
);

CREATE TABLE IF NOT EXISTS job_site_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_site_id uuid NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 20),
  name text,
  email text,
  cell text,
  office_phone text,
  master_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_site_id, slot_number)
);

CREATE TYPE import_type AS ENUM ('EMPLOYEE', 'CUSTOMER', 'JOB', 'ASSIGNMENT');

CREATE TABLE IF NOT EXISTS data_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type import_type NOT NULL,
  imported_by uuid REFERENCES users(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  pasted_count int NOT NULL DEFAULT 0,
  created_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS data_import_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES data_import_runs(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  status text NOT NULL,
  action text,
  message text,
  row_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_runs_type_at ON data_import_runs (import_type, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_job_site_contacts_site ON job_site_contacts (job_site_id);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_site_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_run_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_contacts_admin ON customer_contacts FOR ALL USING (public.is_admin());
CREATE POLICY job_site_contacts_admin ON job_site_contacts FOR ALL USING (public.is_admin());
CREATE POLICY data_import_runs_admin ON data_import_runs FOR ALL USING (public.is_admin());
CREATE POLICY data_import_run_rows_admin ON data_import_run_rows FOR ALL USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_import_status(p_status text, p_default text DEFAULT 'ACTIVE')
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := upper(trim(coalesce(p_status, '')));
BEGIN
  IF v IN ('ACTIVE', 'INACTIVE') THEN RETURN v; END IF;
  IF v IN ('A', 'ACT', 'ENABLED') THEN RETURN 'ACTIVE'; END IF;
  IF v IN ('I', 'INACT', 'DISABLED') THEN RETURN 'INACTIVE'; END IF;
  RETURN p_default;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_email(p_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_email IS NULL OR trim(p_email) = '' OR p_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';
$$;

CREATE OR REPLACE FUNCTION public.import_row_result(
  p_row int, p_status text, p_action text, p_message text, p_data jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'row', p_row, 'status', p_status, 'action', p_action, 'message', p_message, 'data', coalesce(p_data, '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Employee import
-- ---------------------------------------------------------------------------

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
    v_master_id := nullif(trim(v_row->>'master_employee_id'), '');
    v_first := nullif(trim(v_row->>'first_name'), '');
    v_last := nullif(trim(v_row->>'last_name'), '');
    v_email := nullif(trim(v_row->>'email'), '');
    v_phone := nullif(trim(v_row->>'phone'), '');
    v_position := nullif(trim(v_row->>'position'), '');
    v_pay := nullif(trim(v_row->>'hourly_rate'), '')::numeric;
    v_bill := nullif(trim(v_row->>'bill_rate'), '')::numeric;
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

-- ---------------------------------------------------------------------------
-- Customer import (single wide row in array)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_customers_batch(p_rows jsonb, p_dry_run boolean DEFAULT true)
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
  v_master_id text;
  v_name text;
  v_existing uuid;
  v_customer_id uuid;
  v_slot int;
  v_contact jsonb;
  v_warnings text;
  v_action text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_user_id := public.get_my_user_id();

  IF NOT p_dry_run THEN
    INSERT INTO data_import_runs (import_type, imported_by, pasted_count, dry_run)
    VALUES ('CUSTOMER', v_user_id, jsonb_array_length(p_rows), false) RETURNING id INTO v_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    v_master_id := nullif(trim(v_row->>'master_customer_id'), '');
    v_name := nullif(trim(v_row->>'company_name'), '');

    IF v_master_id IS NULL OR v_name IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Customer ID and Name are required');
      CONTINUE;
    END IF;

    SELECT id INTO v_existing FROM customers WHERE master_customer_id = v_master_id LIMIT 1;
    v_warnings := '';

    v_warnings := '';
    v_action := CASE WHEN v_existing IS NULL THEN 'create' ELSE 'update' END;

    IF v_existing IS NULL THEN
      IF p_dry_run THEN
        v_created := v_created + 1;
      ELSE
        INSERT INTO customers (master_customer_id, company_name, customer_type, street, city, state, zip, address, status)
        VALUES (
          v_master_id, v_name, nullif(trim(v_row->>'customer_type'), ''),
          nullif(trim(v_row->>'street'), ''), nullif(trim(v_row->>'city'), ''),
          nullif(trim(v_row->>'state'), ''), nullif(trim(v_row->>'zip'), ''),
          nullif(trim(v_row->>'street'), ''), 'ACTIVE'::customer_status
        ) RETURNING id INTO v_customer_id;
        v_created := v_created + 1;
      END IF;
    ELSE
      IF p_dry_run THEN
        v_updated := v_updated + 1;
      ELSE
        UPDATE customers SET
          company_name = v_name,
          customer_type = coalesce(nullif(trim(v_row->>'customer_type'), ''), customer_type),
          street = coalesce(nullif(trim(v_row->>'street'), ''), street),
          city = coalesce(nullif(trim(v_row->>'city'), ''), city),
          state = coalesce(nullif(trim(v_row->>'state'), ''), state),
          zip = coalesce(nullif(trim(v_row->>'zip'), ''), zip),
          address = coalesce(nullif(trim(v_row->>'street'), ''), address),
          updated_at = now()
        WHERE id = v_existing;
        v_customer_id := v_existing;
        v_updated := v_updated + 1;
      END IF;
      v_customer_id := coalesce(v_customer_id, v_existing);
    END IF;

    IF p_dry_run AND v_row->'contacts' IS NOT NULL THEN
      FOR v_slot IN 1..10 LOOP
        v_contact := v_row->'contacts'->((v_slot - 1)::text);
        IF v_contact IS NULL OR v_contact = 'null'::jsonb THEN CONTINUE; END IF;
        IF coalesce(trim(v_contact->>'email'), '') <> '' AND NOT public.is_valid_email(v_contact->>'email') THEN
          v_warnings := v_warnings || ' Invalid contact ' || v_slot || ' email;';
        END IF;
      END LOOP;
    END IF;

    IF p_dry_run THEN
      v_results := v_results || public.import_row_result(
        v_i,
        CASE WHEN v_warnings <> '' THEN 'warning' ELSE 'ready' END,
        v_action,
        CASE v_action WHEN 'create' THEN 'Customer will be created' ELSE 'Customer will be updated' END || v_warnings
      );
    END IF;

    IF NOT p_dry_run AND v_customer_id IS NOT NULL THEN
      FOR v_slot IN 1..10 LOOP
        v_contact := v_row->'contacts'->((v_slot - 1)::text);
        IF v_contact IS NULL OR v_contact = 'null'::jsonb THEN CONTINUE; END IF;
        IF coalesce(trim(v_contact->>'first_name'), '') = '' AND coalesce(trim(v_contact->>'last_name'), '') = '' THEN CONTINUE; END IF;
        IF coalesce(trim(v_contact->>'email'), '') <> '' AND NOT public.is_valid_email(v_contact->>'email') THEN
          v_warnings := v_warnings || ' Invalid contact ' || v_slot || ' email;';
        END IF;
        INSERT INTO customer_contacts (customer_id, slot_number, first_name, last_name, title, email, cell, office_phone)
        VALUES (
          v_customer_id, v_slot,
          nullif(trim(v_contact->>'first_name'), ''), nullif(trim(v_contact->>'last_name'), ''),
          nullif(trim(v_contact->>'title'), ''), nullif(trim(v_contact->>'email'), ''),
          nullif(trim(v_contact->>'cell'), ''), nullif(trim(v_contact->>'office_phone'), '')
        )
        ON CONFLICT (customer_id, slot_number) DO UPDATE SET
          first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, title = EXCLUDED.title,
          email = EXCLUDED.email, cell = EXCLUDED.cell, office_phone = EXCLUDED.office_phone, updated_at = now();
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

-- ---------------------------------------------------------------------------
-- Job import
-- ---------------------------------------------------------------------------

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
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_user_id := public.get_my_user_id();

  IF NOT p_dry_run THEN
    INSERT INTO data_import_runs (import_type, imported_by, pasted_count, dry_run)
    VALUES ('JOB', v_user_id, jsonb_array_length(p_rows), false) RETURNING id INTO v_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    v_master_job := nullif(trim(v_row->>'master_job_id'), '');
    v_master_customer := nullif(trim(v_row->>'master_customer_id'), '');
    v_name := nullif(trim(v_row->>'name'), '');

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

    BEGIN
      v_start := nullif(trim(v_row->>'start_date'), '')::date;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid start date');
      CONTINUE;
    END;

    v_status := public.normalize_import_status(v_row->>'status', 'ACTIVE')::job_site_status;
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
          coalesce(nullif(trim(v_row->>'street'), ''), '—'),
          nullif(trim(v_row->>'city'), ''), nullif(trim(v_row->>'state'), ''), nullif(trim(v_row->>'zip'), ''),
          v_start, v_status,
          nullif(trim(v_row->>'foreman_name'), ''), nullif(trim(v_row->>'foreman_email'), ''), nullif(trim(v_row->>'foreman_phone'), '')
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
          address = coalesce(nullif(trim(v_row->>'street'), ''), address),
          city = coalesce(nullif(trim(v_row->>'city'), ''), city),
          state = coalesce(nullif(trim(v_row->>'state'), ''), state),
          zip_code = coalesce(nullif(trim(v_row->>'zip'), ''), zip_code),
          start_date = coalesce(v_start, start_date),
          status = v_status, updated_at = now()
        WHERE id = v_existing;
        v_site_id := v_existing;
        v_updated := v_updated + 1;
      END IF;
      v_site_id := v_existing;
    END IF;

    IF NOT p_dry_run AND v_site_id IS NOT NULL THEN
      FOR v_slot IN 1..20 LOOP
        v_foreman := v_row->'foremen'->((v_slot - 1)::text);
        IF v_foreman IS NULL OR v_foreman = 'null'::jsonb THEN CONTINUE; END IF;
        IF coalesce(trim(v_foreman->>'name'), '') = '' THEN CONTINUE; END IF;
        INSERT INTO job_site_contacts (job_site_id, slot_number, name, email, cell, office_phone)
        VALUES (
          v_site_id, v_slot,
          nullif(trim(v_foreman->>'name'), ''), nullif(trim(v_foreman->>'email'), ''),
          nullif(trim(v_foreman->>'cell'), ''), nullif(trim(v_foreman->>'office_phone'), '')
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

-- ---------------------------------------------------------------------------
-- Assignment import (with conflict detection; resolutions in p_resolutions)
-- p_resolutions: [{ "row": 1, "action": "skip"|"move", "old_end_date": "...", "new_start_date": "..." }]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_assignments_batch(
  p_rows jsonb,
  p_dry_run boolean DEFAULT true,
  p_resolutions jsonb DEFAULT '[]'::jsonb
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
  v_master_emp text;
  v_master_cust text;
  v_master_job text;
  v_emp_id uuid;
  v_cust_id uuid;
  v_site_id uuid;
  v_active_id uuid;
  v_active_job text;
  v_resolution jsonb;
  v_action text;
  v_old_end date;
  v_new_start date;
  v_new_assignment uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_user_id := public.get_my_user_id();

  IF NOT p_dry_run THEN
    INSERT INTO data_import_runs (import_type, imported_by, pasted_count, dry_run)
    VALUES ('ASSIGNMENT', v_user_id, jsonb_array_length(p_rows), false) RETURNING id INTO v_run_id;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_i := v_i + 1;
    v_master_emp := nullif(trim(v_row->>'master_employee_id'), '');
    v_master_cust := nullif(trim(v_row->>'master_customer_id'), '');
    v_master_job := nullif(trim(v_row->>'master_job_id'), '');

    IF v_master_emp IS NULL OR v_master_cust IS NULL OR v_master_job IS NULL THEN
      v_failed := v_failed + 1;
      v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Employee ID, Customer ID, and Job ID are required');
      CONTINUE;
    END IF;

    SELECT id INTO v_emp_id FROM employees WHERE master_employee_id = v_master_emp LIMIT 1;
    SELECT id INTO v_cust_id FROM customers WHERE master_customer_id = v_master_cust LIMIT 1;
    SELECT id INTO v_site_id FROM job_sites WHERE master_job_id = v_master_job LIMIT 1;

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
    WHERE ja.employee_id = v_emp_id AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    LIMIT 1;

    IF v_active_id IS NOT NULL AND v_active_id IS DISTINCT FROM (
      SELECT id FROM job_assignments WHERE employee_id = v_emp_id AND job_site_id = v_site_id
        AND status IN ('PENDING', 'ACCEPTED', 'ACTIVE') LIMIT 1
    ) THEN
      SELECT r INTO v_resolution FROM jsonb_array_elements(p_resolutions) r WHERE (r->>'row')::int = v_i LIMIT 1;
      v_action := coalesce(v_resolution->>'action', '');

      IF p_dry_run AND (v_resolution IS NULL OR v_action = '') THEN
        v_results := v_results || public.import_row_result(
          v_i, 'conflict', 'conflict',
          'Employee already assigned to ' || coalesce(v_active_job, 'another job') || '. Choose Skip or Move.',
          jsonb_build_object('currentJob', v_active_job, 'newJobId', v_master_job)
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
          v_old_end := (v_resolution->>'old_end_date')::date;
          v_new_start := coalesce((v_resolution->>'new_start_date')::date, current_date);
        EXCEPTION WHEN OTHERS THEN
          v_failed := v_failed + 1;
          v_results := v_results || public.import_row_result(v_i, 'error', 'error', 'Invalid move dates');
          CONTINUE;
        END;

        IF p_dry_run THEN
          v_created := v_created + 1;
          v_results := v_results || public.import_row_result(v_i, 'ready', 'move', 'Will end current assignment and create new');
          CONTINUE;
        END IF;

        UPDATE job_assignments SET status = 'COMPLETED', end_date = v_old_end, updated_at = now() WHERE id = v_active_id;
        INSERT INTO job_assignments (employee_id, customer_id, job_site_id, assigned_date, status, master_assignment_id)
        VALUES (v_emp_id, v_cust_id, v_site_id, v_new_start, 'ACTIVE', nullif(trim(v_row->>'master_assignment_id'), ''))
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
        coalesce(nullif(trim(v_row->>'assigned_date'), '')::date, current_date),
        'ACTIVE', nullif(trim(v_row->>'master_assignment_id'), '')
      ) RETURNING id INTO v_new_assignment;
      v_created := v_created + 1;
      v_results := v_results || public.import_row_result(v_i, 'ready', 'create', 'Assignment created', jsonb_build_object('id', v_new_assignment));
    END IF;
  END LOOP;

  IF NOT p_dry_run AND v_run_id IS NOT NULL THEN
    UPDATE data_import_runs SET
      created_count = v_created, updated_count = v_updated, skipped_count = v_skipped, failed_count = v_failed,
      summary = jsonb_build_object('results', v_results) WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object('dryRun', p_dry_run, 'pasted', v_i, 'created', v_created, 'updated', v_updated,
    'skipped', v_skipped, 'failed', v_failed, 'results', v_results, 'runId', v_run_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_employees_batch(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_customers_batch(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_job_sites_batch(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_assignments_batch(jsonb, boolean, jsonb) TO authenticated;
