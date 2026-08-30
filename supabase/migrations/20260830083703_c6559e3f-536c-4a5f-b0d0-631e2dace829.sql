REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_leave_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_hr() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_employee_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_in_my_scope(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_hr() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_employee_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_in_my_scope(uuid) TO authenticated, service_role;