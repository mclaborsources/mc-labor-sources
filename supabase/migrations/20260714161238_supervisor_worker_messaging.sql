CREATE TABLE public.message_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_site_id uuid NOT NULL REFERENCES public.job_sites(id) ON DELETE CASCADE,
  worker_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  supervisor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_site_id, worker_user_id, supervisor_user_id),
  CHECK (worker_user_id <> supervisor_user_id)
);

CREATE TABLE public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.message_conversations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_conversations_worker_idx ON public.message_conversations(worker_user_id, updated_at DESC);
CREATE INDEX message_conversations_supervisor_idx ON public.message_conversations(supervisor_user_id, updated_at DESC);
CREATE INDEX conversation_messages_thread_idx ON public.conversation_messages(conversation_id, created_at);

ALTER TABLE public.message_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_conversations_participants_select
ON public.message_conversations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.id IN (message_conversations.worker_user_id, message_conversations.supervisor_user_id)
  )
);

CREATE POLICY conversation_messages_participants_select
ON public.conversation_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.message_conversations c
    JOIN public.users u ON u.id IN (c.worker_user_id, c.supervisor_user_id)
    WHERE c.id = conversation_messages.conversation_id
      AND u.auth_user_id = (SELECT auth.uid())
  )
);

CREATE POLICY conversation_messages_participants_insert
ON public.conversation_messages FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.message_conversations c
    JOIN public.users u ON u.auth_user_id = (SELECT auth.uid())
    WHERE c.id = conversation_messages.conversation_id
      AND u.id = conversation_messages.sender_user_id
      AND u.id IN (c.worker_user_id, c.supervisor_user_id)
  )
);

GRANT SELECT ON public.message_conversations TO authenticated;
GRANT SELECT, INSERT ON public.conversation_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.list_message_contacts()
RETURNS TABLE (
  contact_user_id uuid,
  contact_name text,
  job_site_id uuid,
  job_site_name text,
  conversation_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_me FROM public.users WHERE auth_user_id = auth.uid() AND status = 'ACTIVE';
  IF NOT FOUND OR v_me.role NOT IN ('WORKER', 'SUPERVISOR') THEN
    RAISE EXCEPTION 'Messaging is available only to active workers and supervisors';
  END IF;

  IF v_me.role = 'WORKER' THEN
    RETURN QUERY
    SELECT DISTINCT ON (su.id, js.id)
      su.id, su.name, js.id, js.name, c.id,
      (SELECT m.body FROM public.conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
      (SELECT m.created_at FROM public.conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
      (SELECT count(*) FROM public.conversation_messages m WHERE m.conversation_id = c.id AND m.sender_user_id <> v_me.id AND m.read_at IS NULL)
    FROM public.job_assignments ja
    JOIN public.job_sites js ON js.id = ja.job_site_id
    JOIN public.supervisor_job_sites sjs ON sjs.job_site_id = ja.job_site_id
    JOIN public.users su ON su.id = sjs.user_id AND su.role = 'SUPERVISOR' AND su.status = 'ACTIVE'
    LEFT JOIN public.message_conversations c
      ON c.job_site_id = js.id AND c.worker_user_id = v_me.id AND c.supervisor_user_id = su.id
    WHERE ja.employee_id = v_me.employee_id
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    ORDER BY su.id, js.id, ja.assigned_date DESC;
  ELSE
    RETURN QUERY
    SELECT DISTINCT ON (wu.id, js.id)
      wu.id, concat_ws(' ', e.first_name, e.last_name), js.id, js.name, c.id,
      (SELECT m.body FROM public.conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
      (SELECT m.created_at FROM public.conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
      (SELECT count(*) FROM public.conversation_messages m WHERE m.conversation_id = c.id AND m.sender_user_id <> v_me.id AND m.read_at IS NULL)
    FROM public.supervisor_job_sites sjs
    JOIN public.job_sites js ON js.id = sjs.job_site_id
    JOIN public.job_assignments ja ON ja.job_site_id = sjs.job_site_id
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
    JOIN public.employees e ON e.id = ja.employee_id
    JOIN public.users wu ON wu.employee_id = e.id AND wu.role = 'WORKER' AND wu.status = 'ACTIVE'
    LEFT JOIN public.message_conversations c
      ON c.job_site_id = js.id AND c.worker_user_id = wu.id AND c.supervisor_user_id = v_me.id
    WHERE sjs.user_id = v_me.id
    ORDER BY wu.id, js.id, ja.assigned_date DESC;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_message_conversation(p_contact_user_id uuid, p_job_site_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me public.users%ROWTYPE;
  v_conversation_id uuid;
BEGIN
  SELECT * INTO v_me FROM public.users WHERE auth_user_id = auth.uid() AND status = 'ACTIVE';

  IF v_me.role = 'WORKER' AND EXISTS (
    SELECT 1 FROM public.job_assignments ja
    JOIN public.supervisor_job_sites sjs ON sjs.job_site_id = ja.job_site_id
    JOIN public.users su ON su.id = sjs.user_id AND su.role = 'SUPERVISOR' AND su.status = 'ACTIVE'
    WHERE ja.employee_id = v_me.employee_id AND ja.job_site_id = p_job_site_id
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE') AND su.id = p_contact_user_id
  ) THEN
    INSERT INTO public.message_conversations(job_site_id, worker_user_id, supervisor_user_id)
    VALUES (p_job_site_id, v_me.id, p_contact_user_id)
    ON CONFLICT (job_site_id, worker_user_id, supervisor_user_id)
    DO UPDATE SET updated_at = public.message_conversations.updated_at
    RETURNING id INTO v_conversation_id;
  ELSIF v_me.role = 'SUPERVISOR' AND EXISTS (
    SELECT 1 FROM public.supervisor_job_sites sjs
    JOIN public.job_assignments ja ON ja.job_site_id = sjs.job_site_id
    JOIN public.users wu ON wu.employee_id = ja.employee_id AND wu.role = 'WORKER' AND wu.status = 'ACTIVE'
    WHERE sjs.user_id = v_me.id AND sjs.job_site_id = p_job_site_id
      AND ja.status IN ('PENDING', 'ACCEPTED', 'ACTIVE') AND wu.id = p_contact_user_id
  ) THEN
    INSERT INTO public.message_conversations(job_site_id, worker_user_id, supervisor_user_id)
    VALUES (p_job_site_id, p_contact_user_id, v_me.id)
    ON CONFLICT (job_site_id, worker_user_id, supervisor_user_id)
    DO UPDATE SET updated_at = public.message_conversations.updated_at
    RETURNING id INTO v_conversation_id;
  ELSE
    RAISE EXCEPTION 'This worker and supervisor are not connected through the selected job site';
  END IF;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid() AND status = 'ACTIVE';
  IF NOT EXISTS (
    SELECT 1 FROM public.message_conversations c
    WHERE c.id = p_conversation_id AND v_user_id IN (c.worker_user_id, c.supervisor_user_id)
  ) THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  UPDATE public.conversation_messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id AND sender_user_id <> v_user_id AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.list_message_contacts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_message_conversation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_message_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_message_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
  END IF;
END $$;
