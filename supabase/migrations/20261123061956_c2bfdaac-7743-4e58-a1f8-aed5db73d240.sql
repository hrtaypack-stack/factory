CREATE OR REPLACE FUNCTION public.guard_hr_self_approval_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND public.is_hr()
     AND (OLD.profile_id = auth.uid() OR NEW.profile_id = auth.uid())
     AND (
       (OLD.profile_id = auth.uid() AND NEW.profile_id IS DISTINCT FROM OLD.profile_id)
       OR (NEW.requires_manager_approval = false
           AND OLD.requires_manager_approval IS DISTINCT FROM NEW.requires_manager_approval)
       OR (NEW.manager_id IS NULL AND OLD.manager_id IS DISTINCT FROM NEW.manager_id)
     ) THEN
    RAISE EXCEPTION 'self_approval_route_change_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_hr_self_approval_route() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_employee_self_approval_guard ON public.employees;
CREATE TRIGGER trg_validate_employee_self_approval_guard
  BEFORE UPDATE OF profile_id, requires_manager_approval, manager_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_hr_self_approval_route();

CREATE OR REPLACE FUNCTION public.leave_request_decide(_ids uuid[], _action text, _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _me uuid := public.my_employee_id();
  _hr boolean := public.is_hr();
  _req public.leave_requests;
  _new public.request_status;
  _processed integer := 0;
  _clean_reason text := NULLIF(btrim(coalesce(_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _action NOT IN ('approve', 'reject', 'cancel') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF _action = 'reject' AND _clean_reason IS NULL THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;

  FOR _req IN
    SELECT * FROM public.leave_requests WHERE id = ANY(_ids) ORDER BY created_at FOR UPDATE
  LOOP
    IF _action = 'cancel' THEN
      IF _req.status NOT IN ('pending_manager', 'pending_hr') THEN CONTINUE; END IF;
      IF NOT (_hr OR _req.submitted_by = _uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
      UPDATE public.leave_requests SET status = 'cancelled' WHERE id = _req.id;
      _new := 'cancelled';
    ELSIF _req.status = 'pending_manager' THEN
      IF NOT (_hr OR (_req.manager_id IS NOT NULL AND _req.manager_id = _me)) THEN
        RAISE EXCEPTION 'not_authorized';
      END IF;
      IF _action = 'approve' THEN
        _new := 'pending_hr';
        UPDATE public.leave_requests
           SET status = _new, manager_decided_by = _uid, manager_decided_at = now()
         WHERE id = _req.id;
      ELSE
        _new := 'rejected';
        UPDATE public.leave_requests
           SET status = _new, manager_decided_by = _uid, manager_decided_at = now(),
               rejection_reason = _clean_reason
         WHERE id = _req.id;
      END IF;
    ELSIF _req.status = 'pending_hr' THEN
      IF NOT _hr THEN RAISE EXCEPTION 'not_authorized'; END IF;
      IF _action = 'approve' AND _req.employee_id = _me THEN CONTINUE; END IF;
      _new := CASE WHEN _action = 'approve' THEN 'approved'::public.request_status ELSE 'rejected'::public.request_status END;
      UPDATE public.leave_requests
         SET status = _new, hr_decided_by = _uid, hr_decided_at = now(),
             rejection_reason = CASE WHEN _action = 'reject' THEN _clean_reason ELSE rejection_reason END
       WHERE id = _req.id;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    VALUES (_uid,
            'leave_request_' || _action || CASE WHEN array_length(_ids, 1) > 1 THEN '_bulk' ELSE '' END,
            'leave_requests', _req.id,
            jsonb_build_object('status', _req.status),
            jsonb_build_object('status', _new, 'rejection_reason', _clean_reason));
    _processed := _processed + 1;
  END LOOP;
  RETURN _processed;
END;
$function$;

DROP POLICY IF EXISTS leave_requests_hr_update ON public.leave_requests;
CREATE POLICY leave_requests_hr_update ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (public.is_hr() AND employee_id IS DISTINCT FROM public.my_employee_id())
  WITH CHECK (public.is_hr() AND employee_id IS DISTINCT FROM public.my_employee_id());

CREATE OR REPLACE FUNCTION public.overtime_request_decide(_ids uuid[], _action text, _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _me uuid := public.my_employee_id();
  _hr boolean := public.is_hr();
  _req public.overtime_requests;
  _new public.request_status;
  _processed integer := 0;
  _clean_reason text := NULLIF(btrim(coalesce(_reason, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _action NOT IN ('approve', 'reject', 'cancel') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF _action = 'reject' AND _clean_reason IS NULL THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;

  FOR _req IN
    SELECT * FROM public.overtime_requests WHERE id = ANY(_ids) ORDER BY created_at FOR UPDATE
  LOOP
    IF _hr AND _action = 'approve' AND EXISTS (
      SELECT 1
      FROM public.overtime_request_employees ore
      JOIN public.employees e ON e.id = ore.employee_id
      WHERE ore.overtime_request_id = _req.id
        AND e.profile_id = _uid
    ) THEN
      CONTINUE;
    END IF;

    IF _action = 'cancel' THEN
      IF _req.status NOT IN ('pending_manager', 'pending_hr') THEN CONTINUE; END IF;
      IF NOT (_hr OR _req.submitted_by = _uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
      UPDATE public.overtime_requests SET status = 'cancelled' WHERE id = _req.id;
      _new := 'cancelled';
    ELSIF _req.status = 'pending_manager' THEN
      IF NOT (_hr OR (_req.manager_id IS NOT NULL AND _req.manager_id = _me)) THEN
        RAISE EXCEPTION 'not_authorized';
      END IF;
      IF _action = 'approve' THEN
        _new := 'pending_hr';
        UPDATE public.overtime_requests
           SET status = _new, manager_decided_by = _uid, manager_decided_at = now()
         WHERE id = _req.id;
      ELSE
        _new := 'rejected';
        UPDATE public.overtime_requests
           SET status = _new, manager_decided_by = _uid, manager_decided_at = now(),
               rejection_reason = _clean_reason
         WHERE id = _req.id;
      END IF;
    ELSIF _req.status = 'pending_hr' THEN
      IF NOT _hr THEN RAISE EXCEPTION 'not_authorized'; END IF;
      _new := CASE WHEN _action = 'approve' THEN 'approved'::public.request_status ELSE 'rejected'::public.request_status END;
      UPDATE public.overtime_requests
         SET status = _new, hr_decided_by = _uid, hr_decided_at = now(),
             rejection_reason = CASE WHEN _action = 'reject' THEN _clean_reason ELSE rejection_reason END
       WHERE id = _req.id;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    VALUES (_uid,
            'overtime_request_' || _action || CASE WHEN array_length(_ids, 1) > 1 THEN '_bulk' ELSE '' END,
            'overtime_requests', _req.id,
            jsonb_build_object('status', _req.status),
            jsonb_build_object('status', _new, 'rejection_reason', _clean_reason));
    _processed := _processed + 1;
  END LOOP;
  RETURN _processed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_hr_self_overtime_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND public.is_hr()
     AND NEW.status = 'approved'::public.request_status
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.overtime_request_employees ore
       JOIN public.employees e ON e.id = ore.employee_id
       WHERE ore.overtime_request_id = NEW.id
         AND e.profile_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'self_approval_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_hr_self_overtime_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_prevent_hr_self_overtime_approval ON public.overtime_requests;
CREATE TRIGGER trg_prevent_hr_self_overtime_approval
  BEFORE UPDATE OF status ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_hr_self_overtime_approval();