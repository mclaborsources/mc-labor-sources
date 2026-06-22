-- Add Salesman to customer master import

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS salesman text;

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
        INSERT INTO customers (master_customer_id, company_name, customer_type, street, city, state, zip, address, salesman, status)
        VALUES (
          v_master_id, v_name, nullif(trim(v_row->>'customer_type'), ''),
          nullif(trim(v_row->>'street'), ''), nullif(trim(v_row->>'city'), ''),
          nullif(trim(v_row->>'state'), ''), nullif(trim(v_row->>'zip'), ''),
          nullif(trim(v_row->>'street'), ''), nullif(trim(v_row->>'salesman'), ''),
          'ACTIVE'::customer_status
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
          salesman = coalesce(nullif(trim(v_row->>'salesman'), ''), salesman),
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
