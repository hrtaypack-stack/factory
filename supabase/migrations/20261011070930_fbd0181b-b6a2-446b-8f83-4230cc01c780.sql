-- Replace tautological USING (true) read policies on reference tables with an
-- explicit signed-in check. Behavior is unchanged (policies apply to the
-- authenticated role only; anon has no read policy), but the predicate is no
-- longer a tautology.

DROP POLICY IF EXISTS departments_read ON public.departments;
CREATE POLICY departments_read ON public.departments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS leave_types_read ON public.leave_types;
CREATE POLICY leave_types_read ON public.leave_types
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);