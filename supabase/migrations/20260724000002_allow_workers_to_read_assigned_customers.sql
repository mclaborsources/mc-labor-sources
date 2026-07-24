-- Workers need the selected assignment customer so generated timesheets can
-- display that customer's company_name. Access is limited to their own assignments.

DROP POLICY IF EXISTS customers_worker_assignment_read ON public.customers;
CREATE POLICY customers_worker_assignment_read
ON public.customers
FOR SELECT
TO authenticated
USING (
  public.get_my_role() = 'WORKER'
  AND EXISTS (
    SELECT 1
    FROM public.job_assignments ja
    WHERE ja.customer_id = customers.id
      AND ja.employee_id = public.get_my_employee_id()
  )
);
