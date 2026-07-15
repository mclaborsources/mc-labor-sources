CREATE TABLE public.daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_site_id uuid NOT NULL REFERENCES public.job_sites(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assigned_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  task_date date NOT NULL DEFAULT current_date,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description text,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.safety_bulletin_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id uuid NOT NULL REFERENCES public.safety_bulletins(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bulletin_id, employee_id)
);

CREATE INDEX daily_tasks_worker_date_idx ON public.daily_tasks(employee_id, task_date DESC);
CREATE INDEX daily_tasks_site_date_idx ON public.daily_tasks(job_site_id, task_date DESC);
CREATE INDEX safety_ack_bulletin_idx ON public.safety_bulletin_acknowledgements(bulletin_id);

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_bulletin_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_tasks_worker_select ON public.daily_tasks FOR SELECT TO authenticated
USING (public.get_my_role() = 'WORKER' AND employee_id = public.get_my_employee_id());
CREATE POLICY daily_tasks_supervisor_select ON public.daily_tasks FOR SELECT TO authenticated
USING (public.is_supervisor_of_job_site(job_site_id));

CREATE POLICY safety_ack_worker_select ON public.safety_bulletin_acknowledgements FOR SELECT TO authenticated
USING (public.get_my_role() = 'WORKER' AND employee_id = public.get_my_employee_id());
CREATE POLICY safety_ack_worker_insert ON public.safety_bulletin_acknowledgements FOR INSERT TO authenticated
WITH CHECK (
  public.get_my_role() = 'WORKER'
  AND employee_id = public.get_my_employee_id()
  AND EXISTS (SELECT 1 FROM public.safety_bulletins b WHERE b.id = bulletin_id AND b.sent_at IS NOT NULL)
);
CREATE POLICY safety_ack_supervisor_select ON public.safety_bulletin_acknowledgements FOR SELECT TO authenticated
USING (
  public.get_my_role() = 'SUPERVISOR'
  AND EXISTS (
    SELECT 1 FROM public.job_assignments ja
    WHERE ja.employee_id = safety_bulletin_acknowledgements.employee_id
      AND public.is_supervisor_of_job_site(ja.job_site_id)
  )
);

GRANT SELECT ON public.daily_tasks TO authenticated;
GRANT SELECT, INSERT ON public.safety_bulletin_acknowledgements TO authenticated;

CREATE OR REPLACE FUNCTION public.create_daily_task(
  p_worker_user_id uuid, p_job_site_id uuid, p_task_date date,
  p_title text, p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me public.users%ROWTYPE; v_employee_id uuid; v_id uuid;
BEGIN
  SELECT * INTO v_me FROM public.users WHERE auth_user_id = auth.uid() AND status = 'ACTIVE';
  IF v_me.role <> 'SUPERVISOR' OR NOT public.is_supervisor_of_job_site(p_job_site_id) THEN
    RAISE EXCEPTION 'Supervisor is not assigned to this job site';
  END IF;
  SELECT employee_id INTO v_employee_id FROM public.users
  WHERE id = p_worker_user_id AND role = 'WORKER' AND status = 'ACTIVE';
  IF v_employee_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.job_assignments ja WHERE ja.employee_id = v_employee_id
      AND ja.job_site_id = p_job_site_id AND ja.status IN ('PENDING','ACCEPTED','ACTIVE')
  ) THEN RAISE EXCEPTION 'Worker is not assigned to this job site'; END IF;
  IF length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Task title is required'; END IF;
  INSERT INTO public.daily_tasks(job_site_id, employee_id, assigned_by_user_id, task_date, title, description)
  VALUES(p_job_site_id, v_employee_id, v_me.id, coalesce(p_task_date,current_date), trim(p_title), nullif(trim(p_description),''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_daily_task_status(p_task_id uuid, p_status text, p_completion_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_employee_id uuid;
BEGIN
  IF p_status NOT IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED') THEN RAISE EXCEPTION 'Invalid task status'; END IF;
  SELECT employee_id INTO v_employee_id FROM public.users WHERE auth_user_id = auth.uid() AND role = 'WORKER' AND status = 'ACTIVE';
  UPDATE public.daily_tasks SET status=p_status, completion_notes=nullif(trim(p_completion_notes),''),
    completed_at=CASE WHEN p_status='COMPLETED' THEN now() ELSE NULL END, updated_at=now()
  WHERE id=p_task_id AND employee_id=v_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_safety_acknowledgement_report()
RETURNS TABLE(bulletin_id uuid, bulletin_title text, employee_name text, job_site_name text, acknowledged_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT b.id, b.title, concat_ws(' ',e.first_name,e.last_name), js.name, ack.acknowledged_at
  FROM public.supervisor_job_sites sjs
  JOIN public.job_sites js ON js.id=sjs.job_site_id
  JOIN public.job_assignments ja ON ja.job_site_id=js.id AND ja.status IN ('PENDING','ACCEPTED','ACTIVE')
  JOIN public.employees e ON e.id=ja.employee_id
  JOIN public.safety_bulletins b ON b.sent_at IS NOT NULL AND (
    b.audience='ALL_EMPLOYEES'
    OR (b.audience='SPECIFIC_JOB_SITE' AND b.job_site_id=js.id)
    OR (b.audience='SPECIFIC_WORKERS' AND EXISTS (SELECT 1 FROM public.safety_bulletin_recipients r WHERE r.bulletin_id=b.id AND r.employee_id=e.id))
  )
  LEFT JOIN public.safety_bulletin_acknowledgements ack ON ack.bulletin_id=b.id AND ack.employee_id=e.id
  JOIN public.users me ON me.id=sjs.user_id AND me.auth_user_id=auth.uid() AND me.role='SUPERVISOR' AND me.status='ACTIVE'
  ORDER BY b.title, concat_ws(' ',e.first_name,e.last_name)
$$;

REVOKE ALL ON FUNCTION public.create_daily_task(uuid,uuid,date,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_daily_task_status(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_safety_acknowledgement_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_daily_task(uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_daily_task_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_safety_acknowledgement_report() TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='daily_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_tasks;
  END IF;
END $$;
