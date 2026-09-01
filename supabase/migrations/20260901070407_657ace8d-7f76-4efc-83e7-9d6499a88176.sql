REVOKE EXECUTE ON FUNCTION public.overtime_initial_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.overtime_request_submit(date, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.overtime_request_update(uuid, date, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.overtime_request_decide(uuid[], text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_overtime_shift() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.overtime_initial_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_submit(date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_update(uuid, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_decide(uuid[], text, text) TO authenticated;