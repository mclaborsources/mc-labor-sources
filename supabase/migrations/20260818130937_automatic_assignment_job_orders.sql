-- Generate the employee job-order document from each assignment and preserve a snapshot.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS home_phone text,
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.job_sites
  ADD COLUMN IF NOT EXISTS project_start_time text,
  ADD COLUMN IF NOT EXISTS project_instructions text;

ALTER TABLE public.job_assignments
  ADD COLUMN IF NOT EXISTS pay_rate numeric(10, 2),
  ADD COLUMN IF NOT EXISTS job_position text,
  ADD COLUMN IF NOT EXISTS salesman text,
  ADD COLUMN IF NOT EXISTS salesman_cell text;

ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.job_assignments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.job_orders DROP CONSTRAINT IF EXISTS job_orders_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS job_orders_assignment_id_key
  ON public.job_orders (assignment_id) WHERE assignment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_assignment_job_order(p_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.job_assignments%ROWTYPE;
  v_employee public.employees%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_site public.job_sites%ROWTYPE;
  v_creator uuid;
  v_order_id uuid;
  v_snapshot jsonb;
  v_footer text;
BEGIN
  SELECT * INTO v_assignment FROM public.job_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_employee FROM public.employees WHERE id = v_assignment.employee_id;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_assignment.customer_id;
  SELECT * INTO v_site FROM public.job_sites WHERE id = v_assignment.job_site_id;
  v_creator := public.get_my_user_id();
  IF v_creator IS NULL THEN
    SELECT id INTO v_creator FROM public.users
    WHERE role IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'
    ORDER BY created_at LIMIT 1;
  END IF;
  IF v_creator IS NULL THEN RETURN NULL; END IF;

  v_footer := 'Please note:\n1) No fees are charged to workers for tools/equipment/training.\n2) The Temporary Workers Right To Know Law is administered by the Department of Labor Standards, 100 Cambridge Street, Suite 500, Boston, MA 02114; 617-626-6970.\n3) You are responsible for your own travel and parking fees.\n4) Massachusetts General Law Chapter 149, section 159C limits fees and charges that may be charged by staffing agencies. Staffing agencies shall not deduct fees and charges from a worker''s paycheck. Any applicable voluntary-fee contract must be attached to this job order.\n5) If you encounter an emergency or have any other requirements while on the job site, please contact your office representative, ' || coalesce(v_assignment.salesman, 'the office') || coalesce(' at ' || v_assignment.salesman_cell, '') || '. Your safety and well-being are our top priority.';

  v_snapshot := jsonb_build_object(
    'jobOrderNumber', coalesce(v_site.master_job_id, v_assignment.master_assignment_id, v_assignment.id::text),
    'trackingId', v_assignment.master_assignment_id,
    'employeeName', trim(concat_ws(' ', v_employee.first_name, v_employee.last_name)),
    'employeeAddress', v_employee.address,
    'employeeEmail', v_employee.email,
    'payRate', coalesce(v_assignment.pay_rate, v_employee.hourly_rate),
    'homePhone', v_employee.home_phone,
    'mobilePhone', v_employee.phone,
    'customerName', v_customer.company_name,
    'customerMailingAddress', v_customer.address,
    'jobName', v_site.name,
    'siteAddress', concat_ws(', ', nullif(v_site.address, ''), nullif(v_site.city, ''), nullif(concat_ws(' ', v_site.state, v_site.zip_code), '')),
    'foremanName', v_site.foreman_name,
    'foremanPhone', v_site.foreman_phone,
    'foremanEmail', v_site.foreman_email,
    'startTime', coalesce(v_assignment.start_time, v_site.project_start_time),
    'estimatedEndDate', v_assignment.end_date,
    'jobInstructions', v_site.project_instructions,
    'jobPosition', coalesce(v_assignment.job_position, v_employee.position),
    'startDate', v_assignment.assigned_date,
    'salesman', v_assignment.salesman,
    'salesmanCell', v_assignment.salesman_cell,
    'protectiveEquipment', 'Please make sure you have your tools, hardhat, safety glasses, visibility vest, boots and work gloves.',
    'scopeChangeNotice', 'Please alert us if the scope of work changes or if there are workplace hazards.',
    'strikeOrLockout', false,
    'anticipatedOvertime', false,
    'specialTraining', false,
    'assignmentNature', 'Residential and commercial work',
    'payDate', 'Thursday after work week',
    'specialSiteData', 'Not applicable',
    'transportationAndMeals', 'You are required to provide your own transportation and meals',
    'deliveryMethod', 'Electronic',
    'workersCompCompany', 'Rogers & Gray Insurance Agency, Inc.',
    'workersCompAddress', '434 Route 134, South Dennis, MA 02660',
    'footerNote', v_footer
  );

  INSERT INTO public.job_orders (
    assignment_id, order_number, customer_id, job_site_id, employee_id,
    title, description, start_date, start_time, required_position, instructions,
    safety_notes, status, sent_at, created_by_id, snapshot
  ) VALUES (
    v_assignment.id,
    coalesce(v_site.master_job_id, v_assignment.master_assignment_id, v_assignment.id::text),
    v_assignment.customer_id, v_assignment.job_site_id, v_assignment.employee_id,
    coalesce(v_site.name, 'Job Assignment'), 'Employee assignment job order',
    v_assignment.assigned_date, coalesce(v_assignment.start_time, v_site.project_start_time),
    coalesce(v_assignment.job_position, v_employee.position), v_site.project_instructions,
    'Follow all site PPE and workplace safety requirements.',
    CASE WHEN v_assignment.status IN ('COMPLETED', 'CANCELLED') THEN 'COMPLETED'::job_order_status ELSE 'SENT'::job_order_status END,
    now(), v_creator, v_snapshot
  )
  ON CONFLICT (assignment_id) WHERE assignment_id IS NOT NULL DO UPDATE SET
    order_number = EXCLUDED.order_number,
    customer_id = EXCLUDED.customer_id,
    job_site_id = EXCLUDED.job_site_id,
    employee_id = EXCLUDED.employee_id,
    title = EXCLUDED.title,
    start_date = EXCLUDED.start_date,
    start_time = EXCLUDED.start_time,
    required_position = EXCLUDED.required_position,
    instructions = EXCLUDED.instructions,
    status = CASE
      WHEN EXCLUDED.status = 'COMPLETED' THEN 'COMPLETED'::job_order_status
      WHEN public.job_orders.status = 'ACKNOWLEDGED' THEN 'ACKNOWLEDGED'::job_order_status
      ELSE 'SENT'::job_order_status
    END,
    snapshot = EXCLUDED.snapshot,
    updated_at = now()
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_assignment_job_order(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assignment_job_order_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_assignment_job_order(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_job_order ON public.job_assignments;
CREATE TRIGGER trg_assignment_job_order
AFTER INSERT OR UPDATE OF employee_id, customer_id, job_site_id, assigned_date, end_date,
  start_time, status, pay_rate, job_position, salesman, salesman_cell
ON public.job_assignments
FOR EACH ROW EXECUTE FUNCTION public.assignment_job_order_trigger();

CREATE OR REPLACE FUNCTION public.sync_imported_job_orders(
  p_assignment_rows jsonb,
  p_employee_rows jsonb,
  p_job_rows jsonb,
  p_week_start date,
  p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_assignment_id uuid;
  v_synced int := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end <> p_week_start + 6 THEN
    RAISE EXCEPTION 'A valid Saturday-Friday working week is required';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_employee_rows, '[]'::jsonb)) LOOP
    UPDATE public.employees SET
      home_phone = coalesce(public.nullif_import_text(v_row->>'home_phone'), home_phone),
      address = coalesce(public.nullif_import_text(v_row->>'address'), address)
    WHERE master_employee_id = public.nullif_import_text(v_row->>'master_employee_id');
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_job_rows, '[]'::jsonb)) LOOP
    UPDATE public.job_sites SET
      project_start_time = coalesce(public.nullif_import_text(v_row->>'start_time'), project_start_time),
      project_instructions = coalesce(public.nullif_import_text(v_row->>'instructions'), project_instructions)
    WHERE master_job_id = public.nullif_import_text(v_row->>'master_job_id');
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_assignment_rows, '[]'::jsonb)) LOOP
    SELECT ja.id INTO v_assignment_id
    FROM public.job_assignments ja
    JOIN public.employees e ON e.id = ja.employee_id
    JOIN public.job_sites js ON js.id = ja.job_site_id
    WHERE e.master_employee_id = public.nullif_import_text(v_row->>'master_employee_id')
      AND js.master_job_id = public.nullif_import_text(v_row->>'master_job_id')
      AND ja.assigned_date = p_week_start
    ORDER BY ja.created_at DESC LIMIT 1;

    IF v_assignment_id IS NOT NULL THEN
      UPDATE public.job_assignments SET
        pay_rate = nullif(regexp_replace(coalesce(public.nullif_import_text(v_row->>'pay_rate'), ''), '[$,]', '', 'g'), '')::numeric,
        job_position = public.nullif_import_text(v_row->>'job_position'),
        salesman = public.nullif_import_text(v_row->>'salesman'),
        salesman_cell = public.nullif_import_text(v_row->>'salesman_cell'),
        updated_at = now()
      WHERE id = v_assignment_id;
      PERFORM public.refresh_assignment_job_order(v_assignment_id);
      v_synced := v_synced + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('synced', v_synced);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_imported_job_orders(jsonb, jsonb, jsonb, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_imported_job_orders(jsonb, jsonb, jsonb, date, date) TO authenticated;

-- Generate documents for existing assignments where an admin user is available.
DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.job_assignments LOOP
    PERFORM public.refresh_assignment_job_order(v_id);
  END LOOP;
END;
$$;
