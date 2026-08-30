ALTER TABLE public.leave_types ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON public.leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_manager ON public.leave_requests (manager_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_submitted_by ON public.leave_requests (submitted_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON public.leave_requests (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_at ON public.leave_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_supervisor ON public.employees (supervisor_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON public.employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity, entity_id, created_at DESC);

-- always derive days_count on the server; reject inverted ranges
CREATE OR REPLACE FUNCTION public.validate_leave_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date_before_start_date';
  END IF;
  NEW.days_count := (NEW.end_date - NEW.start_date) + 1;
  RETURN NEW;
END; $$;

UPDATE public.leave_requests SET days_count = (end_date - start_date) + 1
WHERE days_count <> (end_date - start_date) + 1;

CREATE OR REPLACE FUNCTION public.leave_initial_status(_employee_id uuid)
RETURNS request_status
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN e.requires_manager_approval AND e.manager_id IS NOT NULL THEN 'pending_manager'::request_status
    ELSE 'pending_hr'::request_status
  END
  FROM public.employees e WHERE e.id = _employee_id;
$$;

CREATE OR REPLACE FUNCTION public.leave_request_submit(
  _employee_id uuid,
  _leave_type_id uuid,
  _start_date date,
  _end_date date,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _emp public.employees;
  _status request_status;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _emp FROM public.employees WHERE id = _employee_id;
  IF _emp.id IS NULL THEN RAISE EXCEPTION 'employee_not_found'; END IF;
  IF NOT _emp.is_active THEN RAISE EXCEPTION 'employee_inactive'; END IF;

  IF NOT (public.is_hr() OR public.employee_in_my_scope(_employee_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.leave_types WHERE id = _leave_type_id AND is_active) THEN
    RAISE EXCEPTION 'leave_type_invalid';
  END IF;

  IF _end_date < _start_date THEN RAISE EXCEPTION 'end_date_before_start_date'; END IF;

  _status := public.leave_initial_status(_employee_id);

  INSERT INTO public.leave_requests
    (employee_id, leave_type_id, start_date, end_date, reason, status, submitted_by, manager_id)
  VALUES
    (_employee_id, _leave_type_id, _start_date, _end_date, NULLIF(btrim(coalesce(_reason,'')),''),
     _status, _uid, _emp.manager_id)
  RETURNING id INTO _new_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (_uid, 'leave_request_created', 'leave_requests', _new_id,
          jsonb_build_object('employee_id', _employee_id, 'status', _status,
                             'start_date', _start_date, 'end_date', _end_date));

  RETURN _new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.leave_request_update(
  _id uuid,
  _leave_type_id uuid,
  _start_date date,
  _end_date date,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.leave_requests;
  _material boolean;
  _status request_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _req FROM public.leave_requests WHERE id = _id;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF NOT (public.is_hr() OR _req.submitted_by = _uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _req.status NOT IN ('pending_manager','pending_hr') THEN RAISE EXCEPTION 'request_not_editable'; END IF;
  IF _end_date < _start_date THEN RAISE EXCEPTION 'end_date_before_start_date'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leave_types WHERE id = _leave_type_id AND is_active) THEN
    RAISE EXCEPTION 'leave_type_invalid';
  END IF;

  _material := (_req.start_date <> _start_date OR _req.end_date <> _end_date
                OR _req.leave_type_id <> _leave_type_id);
  _status := _req.status;

  IF _material THEN
    _status := public.leave_initial_status(_req.employee_id);
  END IF;

  UPDATE public.leave_requests SET
    leave_type_id = _leave_type_id,
    start_date = _start_date,
    end_date = _end_date,
    reason = NULLIF(btrim(coalesce(_reason,'')),''),
    status = _status,
    manager_decided_by = CASE WHEN _material THEN NULL ELSE manager_decided_by END,
    manager_decided_at = CASE WHEN _material THEN NULL ELSE manager_decided_at END,
    rejection_reason = CASE WHEN _material THEN NULL ELSE rejection_reason END
  WHERE id = _id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (_uid, 'leave_request_edited', 'leave_requests', _id,
          jsonb_build_object('status', _req.status, 'start_date', _req.start_date,
                             'end_date', _req.end_date, 'leave_type_id', _req.leave_type_id),
          jsonb_build_object('status', _status, 'start_date', _start_date,
                             'end_date', _end_date, 'leave_type_id', _leave_type_id));

  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.leave_request_decide(
  _ids uuid[],
  _action text,
  _reason text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _me uuid := public.my_employee_id();
  _hr boolean := public.is_hr();
  _req public.leave_requests;
  _new request_status;
  _processed integer := 0;
  _clean_reason text := NULLIF(btrim(coalesce(_reason,'')),'');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _action NOT IN ('approve','reject','cancel') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF _action = 'reject' AND _clean_reason IS NULL THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;

  FOR _req IN
    SELECT * FROM public.leave_requests WHERE id = ANY(_ids) ORDER BY created_at FOR UPDATE
  LOOP
    IF _action = 'cancel' THEN
      IF _req.status NOT IN ('pending_manager','pending_hr') THEN CONTINUE; END IF;
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
      _new := CASE WHEN _action = 'approve' THEN 'approved'::request_status ELSE 'rejected'::request_status END;
      UPDATE public.leave_requests
         SET status = _new, hr_decided_by = _uid, hr_decided_at = now(),
             rejection_reason = CASE WHEN _action = 'reject' THEN _clean_reason ELSE rejection_reason END
       WHERE id = _req.id;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    VALUES (_uid,
            'leave_request_' || _action || CASE WHEN array_length(_ids,1) > 1 THEN '_bulk' ELSE '' END,
            'leave_requests', _req.id,
            jsonb_build_object('status', _req.status),
            jsonb_build_object('status', _new, 'rejection_reason', _clean_reason));

    _processed := _processed + 1;
  END LOOP;

  RETURN _processed;
END; $$;

REVOKE ALL ON FUNCTION public.leave_initial_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_submit(uuid, uuid, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_update(uuid, uuid, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_decide(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_initial_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_submit(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_update(uuid, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_decide(uuid[], text, text) TO authenticated;

-- direct table writes are no longer needed: all workflow goes through the functions above
DROP POLICY IF EXISTS leave_requests_insert ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_update ON public.leave_requests;
CREATE POLICY leave_requests_hr_update ON public.leave_requests
  FOR UPDATE TO authenticated USING (public.is_hr()) WITH CHECK (public.is_hr());