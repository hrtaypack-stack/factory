CREATE OR REPLACE FUNCTION public.overtime_request_has_scoped_employee(_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.overtime_request_employees ore
    WHERE ore.overtime_request_id = _request_id AND public.employee_in_my_scope(ore.employee_id));
$$;
CREATE OR REPLACE FUNCTION public.overtime_request_submitted_by_me(_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.overtime_requests r
    WHERE r.id = _request_id AND r.submitted_by = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.overtime_request_has_scoped_employee(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.overtime_request_submitted_by_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.overtime_request_has_scoped_employee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_submitted_by_me(uuid) TO authenticated;

DROP POLICY IF EXISTS overtime_requests_read ON public.overtime_requests;
CREATE POLICY overtime_requests_read ON public.overtime_requests FOR SELECT TO authenticated
USING (public.is_hr() OR submitted_by = auth.uid()
  OR (manager_id IS NOT NULL AND manager_id = public.my_employee_id())
  OR public.overtime_request_has_scoped_employee(id));

DROP POLICY IF EXISTS ore_read ON public.overtime_request_employees;
CREATE POLICY ore_read ON public.overtime_request_employees FOR SELECT TO authenticated
USING (public.is_hr() OR public.employee_in_my_scope(employee_id)
  OR public.overtime_request_submitted_by_me(overtime_request_id));