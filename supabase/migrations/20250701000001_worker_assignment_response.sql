-- Allow a worker to accept or decline only their own pending assignment.
-- A dedicated RPC prevents workers from changing dates, sites, notes, or other fields.
CREATE OR REPLACE FUNCTION public.respond_to_assignment(
  p_assignment_id uuid,
  p_response assignment_status
)
RETURNS SETOF job_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() <> 'WORKER' THEN
    RAISE EXCEPTION 'Only workers can respond to assignments';
  END IF;

  IF p_response NOT IN ('ACCEPTED'::assignment_status, 'DECLINED'::assignment_status) THEN
    RAISE EXCEPTION 'Response must be ACCEPTED or DECLINED';
  END IF;

  RETURN QUERY
  UPDATE job_assignments
  SET status = p_response,
      updated_at = now()
  WHERE id = p_assignment_id
    AND employee_id = public.get_my_employee_id()
    AND status = 'PENDING'::assignment_status
  RETURNING *;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending assignment not found or already answered';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_assignment(uuid, assignment_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_assignment(uuid, assignment_status) TO authenticated;
