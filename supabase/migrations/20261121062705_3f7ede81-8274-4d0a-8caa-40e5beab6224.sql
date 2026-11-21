CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
    WHEN _user_id = auth.uid() THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles caller_role
      WHERE caller_role.user_id = auth.uid()
        AND caller_role.role = 'hr'::public.app_role
    ) THEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.overtime_initial_status(_requester uuid)
RETURNS public.request_status
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status public.request_status;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND _requester IS DISTINCT FROM auth.uid()
     AND NOT public.is_hr() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (SELECT CASE
       WHEN e.requires_manager_approval AND e.manager_id IS NOT NULL THEN 'pending_manager'::public.request_status
       ELSE 'pending_hr'::public.request_status
     END
     FROM public.employees e
     WHERE e.profile_id = _requester
     LIMIT 1),
    'pending_hr'::public.request_status
  ) INTO _status;

  RETURN _status;
END;
$$;

REVOKE ALL ON FUNCTION public.overtime_initial_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.overtime_initial_status(uuid) TO authenticated, service_role;