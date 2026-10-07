DO $do$
DECLARE t text;
BEGIN
FOREACH t IN ARRAY ARRAY['leave','overtime'] LOOP
EXECUTE format($f$
CREATE OR REPLACE FUNCTION public.%1$s_request_decide(_ids uuid[], _action text, _reason text DEFAULT NULL::text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _me uuid := public.my_employee_id();
  _hr boolean := public.is_hr();
  _req public.%1$s_requests;
  _new request_status;
  _processed integer := 0;
  _clean_reason text := NULLIF(btrim(coalesce(_reason,'')),'');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _action NOT IN ('approve','reject','cancel') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF _action = 'reject' AND _clean_reason IS NULL THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
  FOR _req IN SELECT * FROM public.%1$s_requests WHERE id = ANY(_ids) ORDER BY created_at FOR UPDATE LOOP
    IF _action = 'cancel' THEN
      IF _req.status NOT IN ('pending_manager','pending_hr') THEN CONTINUE; END IF;
      IF NOT (_hr OR _req.submitted_by = _uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
      UPDATE public.%1$s_requests SET status = 'cancelled' WHERE id = _req.id;
      _new := 'cancelled';
    ELSIF _req.status = 'pending_manager' THEN
      IF NOT (_req.manager_id IS NOT NULL AND _req.manager_id = _me) THEN
        IF _hr THEN CONTINUE; END IF;
        RAISE EXCEPTION 'not_authorized';
      END IF;
      IF _action = 'approve' THEN
        _new := 'pending_hr';
        UPDATE public.%1$s_requests SET status = _new, manager_decided_by = _uid, manager_decided_at = now() WHERE id = _req.id;
      ELSE
        _new := 'rejected';
        UPDATE public.%1$s_requests SET status = _new, manager_decided_by = _uid, manager_decided_at = now(),
               rejection_reason = _clean_reason WHERE id = _req.id;
      END IF;
    ELSIF _req.status = 'pending_hr' THEN
      IF NOT _hr THEN RAISE EXCEPTION 'not_authorized'; END IF;
      _new := CASE WHEN _action = 'approve' THEN 'approved'::request_status ELSE 'rejected'::request_status END;
      UPDATE public.%1$s_requests SET status = _new, hr_decided_by = _uid, hr_decided_at = now(),
             rejection_reason = CASE WHEN _action = 'reject' THEN _clean_reason ELSE rejection_reason END
       WHERE id = _req.id;
    ELSE
      CONTINUE;
    END IF;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    VALUES (_uid, '%1$s_request_' || _action || CASE WHEN array_length(_ids,1) > 1 THEN '_bulk' ELSE '' END,
            '%1$s_requests', _req.id, jsonb_build_object('status', _req.status),
            jsonb_build_object('status', _new, 'rejection_reason', _clean_reason));
    _processed := _processed + 1;
  END LOOP;
  RETURN _processed;
END; $fn$;
$f$, t);
END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.leave_request_update(_id uuid, _leave_type_id uuid, _start_date date, _end_date date, _reason text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _req public.leave_requests;
  _material boolean;
  _status request_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _req FROM public.leave_requests WHERE id = _id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT (public.is_hr() OR _req.submitted_by = _uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _req.status NOT IN ('pending_manager','pending_hr','rejected') THEN RAISE EXCEPTION 'request_not_editable'; END IF;
  IF _end_date < _start_date THEN RAISE EXCEPTION 'end_date_before_start_date'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leave_types WHERE id = _leave_type_id AND is_active) THEN
    RAISE EXCEPTION 'leave_type_invalid';
  END IF;
  _material := (_req.start_date <> _start_date OR _req.end_date <> _end_date
                OR _req.leave_type_id <> _leave_type_id OR _req.status = 'rejected');
  _status := _req.status;
  IF _material THEN _status := public.leave_initial_status(_req.employee_id); END IF;
  UPDATE public.leave_requests SET
    leave_type_id = _leave_type_id, start_date = _start_date, end_date = _end_date,
    reason = NULLIF(btrim(coalesce(_reason,'')),''),
    status = _status,
    manager_id = CASE WHEN _material THEN (SELECT manager_id FROM public.employees WHERE id = _req.employee_id) ELSE manager_id END,
    manager_decided_by = CASE WHEN _material THEN NULL ELSE manager_decided_by END,
    manager_decided_at = CASE WHEN _material THEN NULL ELSE manager_decided_at END,
    hr_decided_by = CASE WHEN _material THEN NULL ELSE hr_decided_by END,
    hr_decided_at = CASE WHEN _material THEN NULL ELSE hr_decided_at END,
    rejection_reason = CASE WHEN _material THEN NULL ELSE rejection_reason END
  WHERE id = _id;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (_uid, CASE WHEN _req.status = 'rejected' THEN 'leave_request_resubmitted' ELSE 'leave_request_edited' END,
          'leave_requests', _id,
          jsonb_build_object('status', _req.status, 'start_date', _req.start_date, 'end_date', _req.end_date,
                             'leave_type_id', _req.leave_type_id, 'rejection_reason', _req.rejection_reason),
          jsonb_build_object('status', _status, 'start_date', _start_date, 'end_date', _end_date, 'leave_type_id', _leave_type_id));
  RETURN _id;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.leave_request_decide(uuid[], text, text), public.overtime_request_decide(uuid[], text, text), public.leave_request_update(uuid, uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_request_decide(uuid[], text, text), public.overtime_request_decide(uuid[], text, text), public.leave_request_update(uuid, uuid, date, date, text) TO authenticated;