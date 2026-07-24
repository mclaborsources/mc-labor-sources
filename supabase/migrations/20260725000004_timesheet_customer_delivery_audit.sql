CREATE TABLE public.timesheet_delivery_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  sent_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now(),
  timesheet_count integer NOT NULL CHECK (timesheet_count > 0)
);

CREATE TABLE public.timesheet_delivery_items (
  batch_id uuid NOT NULL REFERENCES public.timesheet_delivery_batches(id) ON DELETE CASCADE,
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE RESTRICT,
  PRIMARY KEY (batch_id, timesheet_id)
);

CREATE INDEX timesheet_delivery_batches_customer_sent_idx
  ON public.timesheet_delivery_batches (customer_id, sent_at DESC);
CREATE INDEX timesheet_delivery_items_timesheet_idx
  ON public.timesheet_delivery_items (timesheet_id);

ALTER TABLE public.timesheet_delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY timesheet_delivery_batches_admin_read
  ON public.timesheet_delivery_batches
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY timesheet_delivery_items_admin_read
  ON public.timesheet_delivery_items
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON public.timesheet_delivery_batches TO authenticated;
GRANT SELECT ON public.timesheet_delivery_items TO authenticated;
