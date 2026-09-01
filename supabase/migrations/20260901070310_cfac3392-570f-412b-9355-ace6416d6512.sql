-- 1. Shift validation on employee-level overtime rows
ALTER TABLE public.overtime_request_employees
  ALTER COLUMN shift_code SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_overtime_shift()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.shift_code NOT IN ('shift_1','shift_2','shift_3','hours_12') THEN
    RAISE EXCEPTION 'shift_invalid';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_overtime_shift ON public.overtime_request_employees;
CREATE TRIGGER trg_validate_overtime_shift
  BEFORE INSERT OR UPDATE ON public.overtime_request_employees
  FOR EACH ROW EXECUTE FUNCTION public.validate_overtime_shift();

CREATE UNIQUE INDEX IF NOT EXISTS ore_unique_employee_per_request
  ON public.overtime_request_employees (overtime_request_id, employee_id);

-- 2. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_ot_requests_status ON public.overtime_requests (status);
CREATE INDEX IF NOT EXISTS idx_ot_requests_work_date ON public.overtime_requests (work_date DESC);
CREATE INDEX IF NOT EXISTS idx_ot_requests_submitted_by ON public.overtime_requests (submitted_by);
CREATE INDEX IF NOT EXISTS idx_ot_requests_manager ON public.overtime_requests (manager_id);
CREATE INDEX IF NOT EXISTS idx_ot_requests_department ON public.overtime_requests (department_id);
CREATE INDEX IF NOT EXISTS idx_ore_request ON public.overtime_request_employees (overtime_request_id);
CREATE INDEX IF NOT EXISTS idx_ore_employee ON public.overtime_request_employees (employee_id);
CREATE INDEX IF NOT EXISTS idx_ore_shift ON public.overtime_request_employees (shift_code);

-- 3. Workflow status helper for a requester (auth user)
CREATE OR REPLACE FUNCTION public.overtime_initial_status(_requester uuid)
RETURNS request_status
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE
       WHEN e.requires_manager_approval AND e.manager_id IS NOT NULL THEN 'pending_manager'::request_status
       ELSE 'pending_hr'::request_status
     END
     FROM public.employees e WHERE e.profile_id = _requester LIMIT 1),
    'pending_hr'::request_status);
$$;

-- 4. Submit
CREATE OR REPLACE FUNCTION public.overtime_request_submit(
  _work_date date,
  _items jsonb,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _me public.employees;
  _status request_status;
  _new_id uuid;
  _item jsonb;
  _emp public.employees;
  _dept uuid;
  _count int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _work_date IS NULL THEN RAISE EXCEPTION 'work_date_required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'employees_required';
  END IF;

  SELECT * INTO _me FROM public.employees WHERE profile_id = _uid LIMIT 1;
  IF _me.id IS NULL AND NOT public.is_hr() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  _status := public.overtime_initial_status(_uid);

  INSERT INTO public.overtime_requests (work_date, notes, status, submitted_by, manager_id)
  VALUES (_work_date, NULLIF(btrim(coalesce(_notes,'')),''), _status, _uid, _me.manager_id)
  RETURNING id INTO _new_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _emp FROM public.employees WHERE id = (_item->>'employee_id')::uuid;
    IF _emp.id IS NULL THEN RAISE EXCEPTION 'employee_not_found'; END IF;
    IF NOT _emp.is_active THEN RAISE EXCEPTION 'employee_inactive'; END IF;
    IF NOT (public.is_hr() OR public.employee_in_my_scope(_emp.id)) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF coalesce(btrim(_item->>'shift_code'),'') = '' THEN RAISE EXCEPTION 'shift_required'; END IF;

    INSERT INTO public.overtime_request_employees (overtime_request_id, employee_id, shift_code)
    VALUES (_new_id, _emp.id, _item->>'shift_code');

    IF _dept IS NULL THEN _dept := _emp.department_id; END IF;
    _count := _count + 1;
  END LOOP;

  UPDATE public.overtime_requests SET department_id = COALESCE(_dept, _me.department_id)
   WHERE id = _new_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (_uid, 'overtime_request_created', 'overtime_requests', _new_id,
          jsonb_build_object('work_date', _work_date, 'status', _status,
                             'employee_count', _count, 'items', _items));

  RETURN _new_id;
END; $$;

-- 5. Update / resubmit
CREATE OR REPLACE FUNCTION public.overtime_request_update(
  _id uuid,
  _work_date date,
  _items jsonb,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.overtime_requests;
  _old jsonb;
  _new jsonb;
  _item jsonb;
  _emp public.employees;
  _status request_status;
  _material boolean;
  _dept uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _work_date IS NULL THEN RAISE EXCEPTION 'work_date_required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'employees_required';
  END IF;

  SELECT * INTO _req FROM public.overtime_requests WHERE id = _id FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT (public.is_hr() OR _req.submitted_by = _uid) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _req.status NOT IN ('pending_manager','pending_hr','rejected') THEN
    RAISE EXCEPTION 'request_not_editable';
  END IF;

  SELECT COALESCE(jsonb_object_agg(employee_id::text, shift_code), '{}'::jsonb) INTO _old
    FROM public.overtime_request_employees WHERE overtime_request_id = _id;

  _new := '{}'::jsonb;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _emp FROM public.employees WHERE id = (_item->>'employee_id')::uuid;
    IF _emp.id IS NULL THEN RAISE EXCEPTION 'employee_not_found'; END IF;
    IF NOT _emp.is_active THEN RAISE EXCEPTION 'employee_inactive'; END IF;
    IF NOT (public.is_hr() OR public.employee_in_my_scope(_emp.id)) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF coalesce(btrim(_item->>'shift_code'),'') = '' THEN RAISE EXCEPTION 'shift_required'; END IF;
    IF _new ? _emp.id::text THEN RAISE EXCEPTION 'duplicate_employee'; END IF;
    _new := _new || jsonb_build_object(_emp.id::text, _item->>'shift_code');
    IF _dept IS NULL THEN _dept := _emp.department_id; END IF;
  END LOOP;

  -- audit employee-level differences
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  SELECT _uid, 'overtime_employee_removed', 'overtime_requests', _id,
         jsonb_build_object('employee_id', k, 'shift_code', _old->>k), NULL
    FROM jsonb_object_keys(_old) k WHERE NOT (_new ? k);

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  SELECT _uid, 'overtime_employee_added', 'overtime_requests', _id,
         NULL, jsonb_build_object('employee_id', k, 'shift_code', _new->>k)
    FROM jsonb_object_keys(_new) k WHERE NOT (_old ? k);

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  SELECT _uid, 'overtime_shift_changed', 'overtime_requests', _id,
         jsonb_build_object('employee_id', k, 'shift_code', _old->>k),
         jsonb_build_object('employee_id', k, 'shift_code', _new->>k)
    FROM jsonb_object_keys(_new) k
   WHERE (_old ? k) AND (_old->>k) IS DISTINCT FROM (_new->>k);

  _material := (_req.work_date <> _work_date) OR (_old <> _new) OR (_req.status = 'rejected');
  _status := _req.status;
  IF _material THEN _status := public.overtime_initial_status(_req.submitted_by); END IF;

  DELETE FROM public.overtime_request_employees WHERE overtime_request_id = _id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.overtime_request_employees (overtime_request_id, employee_id, shift_code)
    VALUES (_id, (_item->>'employee_id')::uuid, _item->>'shift_code');
  END LOOP;

  UPDATE public.overtime_requests SET
    work_date = _work_date,
    notes = NULLIF(btrim(coalesce(_notes,'')),''),
    department_id = COALESCE(_dept, department_id),
    status = _status,
    manager_decided_by = CASE WHEN _material THEN NULL ELSE manager_decided_by END,
    manager_decided_at = CASE WHEN _material THEN NULL ELSE manager_decided_at END,
    hr_decided_by = CASE WHEN _material THEN NULL ELSE hr_decided_by END,
    hr_decided_at = CASE WHEN _material THEN NULL ELSE hr_decided_at END,
    rejection_reason = CASE WHEN _material THEN NULL ELSE rejection_reason END
  WHERE id = _id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (_uid,
          CASE WHEN _req.status = 'rejected' THEN 'overtime_request_resubmitted'
               ELSE 'overtime_request_edited' END,
          'overtime_requests', _id,
          jsonb_build_object('status', _req.status, 'work_date', _req.work_date, 'items', _old),
          jsonb_build_object('status', _status, 'work_date', _work_date, 'items', _new));

  RETURN _id;
END; $$;

-- 6. Decide (single + bulk)
CREATE OR REPLACE FUNCTION public.overtime_request_decide(
  _ids uuid[],
  _action text,
  _reason text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _me uuid := public.my_employee_id();
  _hr boolean := public.is_hr();
  _req public.overtime_requests;
  _new request_status;
  _processed integer := 0;
  _clean_reason text := NULLIF(btrim(coalesce(_reason,'')),'');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _action NOT IN ('approve','reject','cancel') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF _action = 'reject' AND _clean_reason IS NULL THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;

  FOR _req IN SELECT * FROM public.overtime_requests WHERE id = ANY(_ids) ORDER BY created_at FOR UPDATE LOOP
    IF _action = 'cancel' THEN
      IF _req.status NOT IN ('pending_manager','pending_hr') THEN CONTINUE; END IF;
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
      _new := CASE WHEN _action = 'approve' THEN 'approved'::request_status ELSE 'rejected'::request_status END;
      UPDATE public.overtime_requests
         SET status = _new, hr_decided_by = _uid, hr_decided_at = now(),
             rejection_reason = CASE WHEN _action = 'reject' THEN _clean_reason ELSE rejection_reason END
       WHERE id = _req.id;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    VALUES (_uid,
            'overtime_request_' || _action || CASE WHEN array_length(_ids,1) > 1 THEN '_bulk' ELSE '' END,
            'overtime_requests', _req.id,
            jsonb_build_object('status', _req.status),
            jsonb_build_object('status', _new, 'rejection_reason', _clean_reason));

    _processed := _processed + 1;
  END LOOP;

  RETURN _processed;
END; $$;

-- 7. Access rules: reads stay scoped, writes go through the functions only
DROP POLICY IF EXISTS overtime_requests_read ON public.overtime_requests;
CREATE POLICY overtime_requests_read ON public.overtime_requests
  FOR SELECT TO authenticated
  USING (
    public.is_hr()
    OR submitted_by = auth.uid()
    OR (manager_id IS NOT NULL AND manager_id = public.my_employee_id())
    OR EXISTS (
      SELECT 1 FROM public.overtime_request_employees ore
      WHERE ore.overtime_request_id = overtime_requests.id
        AND public.employee_in_my_scope(ore.employee_id)
    )
  );

DROP POLICY IF EXISTS overtime_requests_insert ON public.overtime_requests;
DROP POLICY IF EXISTS overtime_requests_update ON public.overtime_requests;
DROP POLICY IF EXISTS ore_write ON public.overtime_request_employees;

CREATE POLICY overtime_requests_hr_update ON public.overtime_requests
  FOR UPDATE TO authenticated USING (public.is_hr()) WITH CHECK (public.is_hr());

GRANT EXECUTE ON FUNCTION public.overtime_initial_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_submit(date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_update(uuid, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_request_decide(uuid[], text, text) TO authenticated;