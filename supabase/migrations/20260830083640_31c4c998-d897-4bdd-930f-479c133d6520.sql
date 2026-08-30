-- ENUMS
CREATE TYPE public.app_role AS ENUM ('hr', 'manager', 'supervisor', 'employee');
CREATE TYPE public.request_status AS ENUM ('pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled');

-- SHARED updated_at TRIGGER FN
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- DEPARTMENTS
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- EMPLOYEES
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  supervisor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  job_title text,
  hourly_rate numeric(10,2),
  requires_manager_approval boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_code ON public.employees(employee_code);
CREATE INDEX idx_employees_name ON public.employees(full_name);
CREATE INDEX idx_employees_department ON public.employees(department_id);
CREATE INDEX idx_employees_supervisor ON public.employees(supervisor_id);
CREATE INDEX idx_employees_manager ON public.employees(manager_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- LEAVE TYPES
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_paid boolean NOT NULL DEFAULT true,
  max_days_per_year integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

-- LEAVE REQUESTS
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count integer NOT NULL DEFAULT 1,
  reason text,
  status public.request_status NOT NULL DEFAULT 'pending_hr',
  submitted_by uuid NOT NULL,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  manager_decided_by uuid,
  manager_decided_at timestamptz,
  hr_decided_by uuid,
  hr_decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON public.leave_requests(start_date, end_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- OVERTIME REQUESTS
CREATE TABLE public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date date NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  notes text,
  status public.request_status NOT NULL DEFAULT 'pending_hr',
  submitted_by uuid NOT NULL,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  manager_decided_by uuid,
  manager_decided_at timestamptz,
  hr_decided_by uuid,
  hr_decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_overtime_requests_date ON public.overtime_requests(work_date);
CREATE INDEX idx_overtime_requests_status ON public.overtime_requests(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overtime_requests TO authenticated;
GRANT ALL ON public.overtime_requests TO service_role;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

-- OVERTIME REQUEST EMPLOYEES
CREATE TABLE public.overtime_request_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  overtime_request_id uuid NOT NULL REFERENCES public.overtime_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_code text,
  hours numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (overtime_request_id, employee_id)
);
CREATE INDEX idx_ot_emp_request ON public.overtime_request_employees(overtime_request_id);
CREATE INDEX idx_ot_emp_employee ON public.overtime_request_employees(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overtime_request_employees TO authenticated;
GRANT ALL ON public.overtime_request_employees TO service_role;
ALTER TABLE public.overtime_request_employees ENABLE ROW LEVEL SECURITY;

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity, entity_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_hr()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'hr');
$$;

CREATE OR REPLACE FUNCTION public.my_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.employees WHERE profile_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.employee_in_my_scope(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND (
        e.id = public.my_employee_id()
        OR e.supervisor_id = public.my_employee_id()
        OR e.manager_id = public.my_employee_id()
        OR EXISTS (
          SELECT 1 FROM public.employees s
          WHERE s.id = e.supervisor_id AND s.manager_id = public.my_employee_id()
        )
      )
  );
$$;

-- POLICIES: departments
CREATE POLICY "departments_read" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_hr_write" ON public.departments FOR ALL TO authenticated USING (public.is_hr()) WITH CHECK (public.is_hr());

-- POLICIES: profiles
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_hr());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_hr()) WITH CHECK (id = auth.uid() OR public.is_hr());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.is_hr());
CREATE POLICY "profiles_hr_delete" ON public.profiles FOR DELETE TO authenticated USING (public.is_hr());

-- POLICIES: user_roles
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_hr());
CREATE POLICY "user_roles_hr_write" ON public.user_roles FOR ALL TO authenticated USING (public.is_hr()) WITH CHECK (public.is_hr());

-- POLICIES: employees
CREATE POLICY "employees_scoped_read" ON public.employees FOR SELECT TO authenticated
USING (public.is_hr() OR public.employee_in_my_scope(id));
CREATE POLICY "employees_hr_write" ON public.employees FOR ALL TO authenticated USING (public.is_hr()) WITH CHECK (public.is_hr());

-- POLICIES: leave_types
CREATE POLICY "leave_types_read" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "leave_types_hr_write" ON public.leave_types FOR ALL TO authenticated USING (public.is_hr()) WITH CHECK (public.is_hr());

-- POLICIES: leave_requests
CREATE POLICY "leave_requests_read" ON public.leave_requests FOR SELECT TO authenticated
USING (public.is_hr() OR submitted_by = auth.uid() OR public.employee_in_my_scope(employee_id));
CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid() AND (public.is_hr() OR public.employee_in_my_scope(employee_id)));
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE TO authenticated
USING (public.is_hr() OR submitted_by = auth.uid() OR public.employee_in_my_scope(employee_id))
WITH CHECK (public.is_hr() OR submitted_by = auth.uid() OR public.employee_in_my_scope(employee_id));
CREATE POLICY "leave_requests_hr_delete" ON public.leave_requests FOR DELETE TO authenticated USING (public.is_hr());

-- POLICIES: overtime_requests
CREATE POLICY "overtime_requests_read" ON public.overtime_requests FOR SELECT TO authenticated
USING (
  public.is_hr() OR submitted_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.overtime_request_employees ore WHERE ore.overtime_request_id = id AND public.employee_in_my_scope(ore.employee_id))
);
CREATE POLICY "overtime_requests_insert" ON public.overtime_requests FOR INSERT TO authenticated
WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "overtime_requests_update" ON public.overtime_requests FOR UPDATE TO authenticated
USING (public.is_hr() OR submitted_by = auth.uid() OR (manager_id IS NOT NULL AND manager_id = public.my_employee_id()))
WITH CHECK (public.is_hr() OR submitted_by = auth.uid() OR (manager_id IS NOT NULL AND manager_id = public.my_employee_id()));
CREATE POLICY "overtime_requests_hr_delete" ON public.overtime_requests FOR DELETE TO authenticated USING (public.is_hr());

-- POLICIES: overtime_request_employees
CREATE POLICY "ore_read" ON public.overtime_request_employees FOR SELECT TO authenticated
USING (
  public.is_hr() OR public.employee_in_my_scope(employee_id)
  OR EXISTS (SELECT 1 FROM public.overtime_requests r WHERE r.id = overtime_request_id AND r.submitted_by = auth.uid())
);
CREATE POLICY "ore_write" ON public.overtime_request_employees FOR ALL TO authenticated
USING (public.is_hr() OR EXISTS (SELECT 1 FROM public.overtime_requests r WHERE r.id = overtime_request_id AND r.submitted_by = auth.uid()))
WITH CHECK (public.is_hr() OR EXISTS (SELECT 1 FROM public.overtime_requests r WHERE r.id = overtime_request_id AND r.submitted_by = auth.uid()));

-- POLICIES: audit_logs
CREATE POLICY "audit_hr_read" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_hr());
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- TRIGGERS: updated_at
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leave_types_updated BEFORE UPDATE ON public.leave_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_leave_requests_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_overtime_requests_updated BEFORE UPDATE ON public.overtime_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ore_updated BEFORE UPDATE ON public.overtime_request_employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- AUTO PROFILE + DEFAULT ROLE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.employees
     SET profile_id = NEW.id
   WHERE profile_id IS NULL
     AND email IS NOT NULL
     AND lower(email) = lower(NEW.email);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DATE SANITY TRIGGER (instead of CHECK constraints)
CREATE OR REPLACE FUNCTION public.validate_leave_request()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date_before_start_date';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_leave_request BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_leave_request();

-- BASE LEAVE TYPES (configuration, not fake employee data)
INSERT INTO public.leave_types (code, name, is_paid, max_days_per_year) VALUES
  ('ANNUAL', 'إجازة سنوية', true, 21),
  ('SICK', 'إجازة مرضية', true, 15),
  ('UNPAID', 'إجازة بدون راتب', false, NULL),
  ('CASUAL', 'إجازة عارضة', true, 7);
