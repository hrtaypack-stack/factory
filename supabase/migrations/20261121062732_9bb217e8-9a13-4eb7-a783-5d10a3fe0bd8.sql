REVOKE ALL ON FUNCTION public.overtime_initial_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_initial_status(uuid) TO service_role;