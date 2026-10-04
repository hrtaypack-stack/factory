-- 1. Employee validation (relationships + account link)
CREATE OR REPLACE FUNCTION public.validate_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  NEW.employee_code := trim(NEW.employee_code);
  NEW.full_name := trim(NEW.full_name);
  NEW.email := nullif(lower(trim(coalesce(NEW.email, ''))), '');
  IF NEW.employee_code = '' THEN RAISE EXCEPTION 'employee_code_required'; END IF;
  IF NEW.full_name = '' THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF NEW.supervisor_id = NEW.id OR NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'self_relationship';
  END IF;
  IF NEW.supervisor_id IS NOT NULL OR NEW.manager_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE chain(id) AS (
        SELECT x FROM unnest(ARRAY[NEW.supervisor_id, NEW.manager_id]) x WHERE x IS NOT NULL
        UNION
        SELECT p FROM chain c JOIN public.employees e ON e.id = c.id
          CROSS JOIN LATERAL unnest(ARRAY[e.supervisor_id, e.manager_id]) p
        WHERE p IS NOT NULL
      ) SELECT 1 FROM chain WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'circular_relationship';
    END IF;
  END IF;
  IF NEW.profile_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT u.id INTO _uid FROM auth.users u
     WHERE lower(u.email) = NEW.email
       AND NOT EXISTS (SELECT 1 FROM public.employees o WHERE o.profile_id = u.id AND o.id <> NEW.id)
     LIMIT 1;
    NEW.profile_id := _uid;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.validate_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_employee ON public.employees;
CREATE TRIGGER trg_validate_employee BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.validate_employee();

-- 2. Generic audit trigger for administrative tables
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old jsonb; _new jsonb;
BEGIN
  IF current_setting('app.skip_row_audit', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  _old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'updated_at' - 'created_at' END;
  _new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'updated_at' - 'created_at' END;
  IF TG_OP = 'UPDATE' AND _old = _new THEN RETURN NEW; END IF;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  VALUES (auth.uid(), TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME,
          COALESCE((_new ->> 'id')::uuid, (_old ->> 'id')::uuid), _old, _new);
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_employees ON public.employees;
CREATE TRIGGER trg_audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_departments ON public.departments;
CREATE TRIGGER trg_audit_departments AFTER INSERT OR UPDATE OR DELETE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_leave_types ON public.leave_types;
CREATE TRIGGER trg_audit_leave_types AFTER INSERT OR UPDATE OR DELETE ON public.leave_types
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 3. Overtime cost placeholder (filled only by future official rules)
ALTER TABLE public.overtime_request_employees ADD COLUMN IF NOT EXISTS cost numeric;
COMMENT ON COLUMN public.overtime_request_employees.cost IS 'Overtime cost; NULL until official calculation rules are defined. Never estimated.';

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_employees_email_lower ON public.employees (lower(email));
CREATE INDEX IF NOT EXISTS idx_employees_active ON public.employees (is_active);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_profile ON public.employees (profile_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_type ON public.leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_start ON public.leave_requests (start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_submitted_by ON public.leave_requests (submitted_by);
CREATE INDEX IF NOT EXISTS idx_ore_shift ON public.overtime_request_employees (shift_code);
CREATE INDEX IF NOT EXISTS idx_ore_employee ON public.overtime_request_employees (employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_work_date ON public.overtime_requests (work_date);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_submitted_by ON public.overtime_requests (submitted_by);

-- 5. HR-only report views (RLS of base tables still applies)
CREATE OR REPLACE VIEW public.leave_report WITH (security_invoker = on) AS
SELECT lr.id, lr.start_date, lr.end_date, lr.days_count, lr.status, lr.reason, lr.rejection_reason,
       lr.created_at, lr.manager_decided_at, lr.hr_decided_at,
       CASE WHEN lr.status = 'approved' THEN COALESCE(lr.hr_decided_at, lr.manager_decided_at) END AS approved_at,
       lr.leave_type_id, lt.name AS leave_type_name,
       e.id AS employee_id, e.employee_code, e.full_name AS employee_name, e.is_active AS employee_active,
       e.department_id, d.name AS department_name,
       e.supervisor_id, s.full_name AS supervisor_name,
       COALESCE(lr.manager_id, e.manager_id) AS manager_id, m.full_name AS manager_name,
       lr.submitted_by, p.full_name AS submitted_by_name
FROM public.leave_requests lr
JOIN public.employees e ON e.id = lr.employee_id
JOIN public.leave_types lt ON lt.id = lr.leave_type_id
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.employees s ON s.id = e.supervisor_id
LEFT JOIN public.employees m ON m.id = COALESCE(lr.manager_id, e.manager_id)
LEFT JOIN public.profiles p ON p.id = lr.submitted_by
WHERE public.is_hr();

CREATE OR REPLACE VIEW public.overtime_report WITH (security_invoker = on) AS
SELECT ore.id, r.id AS request_id, r.work_date, r.status, ore.shift_code, ore.hours, ore.cost,
       r.created_at, r.manager_decided_at, r.hr_decided_at, r.rejection_reason, r.notes,
       CASE WHEN r.status = 'approved' THEN COALESCE(r.hr_decided_at, r.manager_decided_at) END AS approved_at,
       e.id AS employee_id, e.employee_code, e.full_name AS employee_name, e.is_active AS employee_active,
       e.department_id, d.name AS department_name,
       e.supervisor_id, s.full_name AS supervisor_name,
       e.manager_id, m.full_name AS manager_name,
       r.submitted_by, p.full_name AS submitted_by_name
FROM public.overtime_request_employees ore
JOIN public.overtime_requests r ON r.id = ore.overtime_request_id
JOIN public.employees e ON e.id = ore.employee_id
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.employees s ON s.id = e.supervisor_id
LEFT JOIN public.employees m ON m.id = e.manager_id
LEFT JOIN public.profiles p ON p.id = r.submitted_by
WHERE public.is_hr();

REVOKE ALL ON public.leave_report, public.overtime_report FROM anon, PUBLIC;
GRANT SELECT ON public.leave_report, public.overtime_report TO authenticated;
GRANT SELECT ON public.leave_report, public.overtime_report TO service_role;

-- 6. Safe employee import (validate everything; write in one transaction)
CREATE OR REPLACE FUNCTION public.employees_import(_rows jsonb, _commit boolean DEFAULT false, _skip_invalid boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _total int; _invalid int; _new int; _upd int; _rows_out jsonb;
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  IF jsonb_array_length(_rows) > 5000 THEN RAISE EXCEPTION 'too_many_rows'; END IF;

  DROP TABLE IF EXISTS pg_temp._imp;
  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  SELECT COALESCE((x ->> 'row_no')::int, ord::int) AS row_no,
         nullif(trim(x ->> 'employee_code'), '') AS code,
         nullif(trim(x ->> 'full_name'), '') AS full_name,
         nullif(lower(trim(x ->> 'email')), '') AS email,
         nullif(trim(x ->> 'department'), '') AS dept,
         nullif(lower(trim(x ->> 'supervisor_email')), '') AS sup_email,
         nullif(lower(trim(x ->> 'manager_email')), '') AS mgr_email,
         nullif(trim(x ->> 'job_title'), '') AS job_title,
         CASE WHEN x ? 'is_active' AND x ->> 'is_active' IS NOT NULL THEN (x ->> 'is_active')::boolean END AS is_active,
         CASE WHEN x ? 'requires_manager_approval' AND x ->> 'requires_manager_approval' IS NOT NULL
              THEN (x ->> 'requires_manager_approval')::boolean END AS rma,
         NULL::uuid AS dept_id, NULL::uuid AS existing_id,
         NULL::uuid AS sup_id, NULL::uuid AS mgr_id,
         ARRAY[]::text[] AS errors
  FROM jsonb_array_elements(_rows) WITH ORDINALITY AS t(x, ord);

  UPDATE _imp SET errors = errors || 'كود الموظف مطلوب.' WHERE code IS NULL;
  UPDATE _imp SET errors = errors || 'صيغة كود الموظف غير صحيحة (أحرف وأرقام فقط، حتى ٣٠ خانة).'
   WHERE code IS NOT NULL AND code !~ '^[A-Za-z0-9_\-]{1,30}$';
  UPDATE _imp SET errors = errors || 'اسم الموظف مطلوب.' WHERE full_name IS NULL;
  UPDATE _imp i SET errors = errors || 'كود الموظف مكرر داخل الملف.'
   WHERE code IS NOT NULL AND (SELECT count(*) FROM _imp j WHERE lower(j.code) = lower(i.code)) > 1;
  UPDATE _imp SET errors = errors || 'البريد الإلكتروني غير صحيح.'
   WHERE email IS NOT NULL AND email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  UPDATE _imp i SET errors = errors || 'البريد الإلكتروني مكرر داخل الملف.'
   WHERE email IS NOT NULL AND (SELECT count(*) FROM _imp j WHERE j.email = i.email) > 1;

  UPDATE _imp i SET existing_id = e.id FROM public.employees e WHERE e.employee_code = i.code;
  UPDATE _imp i SET errors = errors || 'البريد الإلكتروني مستخدم لموظف آخر.'
   WHERE email IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.employees e WHERE lower(e.email) = i.email
       AND e.id IS DISTINCT FROM i.existing_id);

  UPDATE _imp i SET dept_id = d.id FROM public.departments d
   WHERE i.dept IS NOT NULL AND (lower(d.name) = lower(i.dept) OR lower(d.code) = lower(i.dept));
  UPDATE _imp SET errors = errors || 'القسم غير موجود.' WHERE dept IS NOT NULL AND dept_id IS NULL;

  UPDATE _imp SET errors = errors || 'لا يمكن أن يكون الموظف مشرفًا أو مديرًا لنفسه.'
   WHERE email IS NOT NULL AND (sup_email = email OR mgr_email = email);

  -- Supervisor / manager resolution: existing employees, or employees in this file
  UPDATE _imp i SET errors = errors || 'البريد الإلكتروني للمشرف غير موجود.'
   WHERE sup_email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE lower(e.email) = i.sup_email)
     AND NOT EXISTS (SELECT 1 FROM _imp j WHERE j.email = i.sup_email);
  UPDATE _imp i SET errors = errors || 'البريد الإلكتروني للمدير غير موجود.'
   WHERE mgr_email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE lower(e.email) = i.mgr_email)
     AND NOT EXISTS (SELECT 1 FROM _imp j WHERE j.email = i.mgr_email);
  UPDATE _imp i SET errors = errors || 'البريد الإلكتروني للمشرف يخص أكثر من موظف.'
   WHERE sup_email IS NOT NULL AND (SELECT count(*) FROM public.employees e WHERE lower(e.email) = i.sup_email) > 1;
  UPDATE _imp i SET errors = errors || 'البريد الإلكتروني للمدير يخص أكثر من موظف.'
   WHERE mgr_email IS NOT NULL AND (SELECT count(*) FROM public.employees e WHERE lower(e.email) = i.mgr_email) > 1;
  -- A relation pointing at an invalid row of this file cannot be resolved safely
  UPDATE _imp i SET errors = errors || 'المشرف أو المدير موجود في صف يحتوي على أخطاء.'
   WHERE cardinality(errors) = 0 AND EXISTS (
     SELECT 1 FROM _imp j WHERE cardinality(j.errors) > 0 AND j.email IS NOT NULL
       AND (j.email = i.sup_email OR j.email = i.mgr_email)
       AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE lower(e.email) = j.email));

  SELECT count(*), count(*) FILTER (WHERE cardinality(errors) > 0),
         count(*) FILTER (WHERE cardinality(errors) = 0 AND existing_id IS NULL),
         count(*) FILTER (WHERE cardinality(errors) = 0 AND existing_id IS NOT NULL)
    INTO _total, _invalid, _new, _upd FROM _imp;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'row_no', row_no, 'employee_code', code, 'full_name', full_name,
           'action', CASE WHEN existing_id IS NULL THEN 'new' ELSE 'update' END,
           'errors', to_jsonb(errors)) ORDER BY row_no), '[]'::jsonb)
    INTO _rows_out FROM _imp;

  IF NOT _commit OR (_invalid > 0 AND NOT _skip_invalid) OR (_new + _upd) = 0 THEN
    RETURN jsonb_build_object('committed', false, 'total', _total, 'invalid', _invalid,
                              'new', _new, 'update', _upd, 'rows', _rows_out);
  END IF;

  PERFORM set_config('app.skip_row_audit', 'on', true);

  -- Pass 1: create/update core fields (blank cells keep existing values)
  INSERT INTO public.employees (employee_code, full_name, email, department_id, job_title, is_active, requires_manager_approval)
  SELECT code, full_name, email, dept_id, job_title, COALESCE(is_active, true), COALESCE(rma, true)
    FROM _imp WHERE cardinality(errors) = 0 AND existing_id IS NULL;

  UPDATE public.employees e SET
    full_name = i.full_name,
    email = COALESCE(i.email, e.email),
    department_id = COALESCE(i.dept_id, e.department_id),
    job_title = COALESCE(i.job_title, e.job_title),
    is_active = COALESCE(i.is_active, e.is_active),
    requires_manager_approval = COALESCE(i.rma, e.requires_manager_approval)
  FROM _imp i WHERE cardinality(i.errors) = 0 AND i.existing_id = e.id;

  -- Pass 2: relationships by email
  UPDATE public.employees e SET
    supervisor_id = COALESCE((SELECT s.id FROM public.employees s WHERE lower(s.email) = i.sup_email), e.supervisor_id),
    manager_id = COALESCE((SELECT m.id FROM public.employees m WHERE lower(m.email) = i.mgr_email), e.manager_id)
  FROM _imp i
  WHERE cardinality(i.errors) = 0 AND e.employee_code = i.code
    AND (i.sup_email IS NOT NULL OR i.mgr_email IS NOT NULL);

  PERFORM set_config('app.skip_row_audit', 'off', true);

  INSERT INTO public.audit_logs (user_id, action, entity, new_value)
  VALUES (auth.uid(), 'employees_import', 'employees',
          jsonb_build_object('total', _total, 'new', _new, 'updated', _upd, 'invalid', _invalid,
                             'codes', (SELECT jsonb_agg(code) FROM _imp WHERE cardinality(errors) = 0)));

  RETURN jsonb_build_object('committed', true, 'total', _total, 'invalid', _invalid,
                            'new', _new, 'update', _upd, 'rows', _rows_out);
END; $$;
REVOKE ALL ON FUNCTION public.employees_import(jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employees_import(jsonb, boolean, boolean) TO authenticated;

-- 7. Optional audit entry for report exports
CREATE OR REPLACE FUNCTION public.log_report_export(_report text, _filters jsonb, _row_count int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.audit_logs (user_id, action, entity, new_value)
  VALUES (auth.uid(), 'report_export', _report,
          jsonb_build_object('filters', _filters, 'rows', _row_count));
END; $$;
REVOKE ALL ON FUNCTION public.log_report_export(text, jsonb, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_report_export(text, jsonb, int) TO authenticated;