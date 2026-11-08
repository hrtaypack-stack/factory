-- Migration: HR Account Management System
-- Provides secure, atomic operations for HR to create, manage, reset passwords,
-- and link employee accounts without accessing Supabase Dashboard.

-- 1. Function: HR Create Employee Account
CREATE OR REPLACE FUNCTION public.hr_create_employee_account(
  _full_name text,
  _employee_code text,
  _email text,
  _password text,
  _role public.app_role DEFAULT 'employee',
  _department_id uuid DEFAULT NULL,
  _job_title text DEFAULT NULL,
  _supervisor_id uuid DEFAULT NULL,
  _manager_id uuid DEFAULT NULL,
  _requires_manager_approval boolean DEFAULT true,
  _is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _clean_name text := trim(COALESCE(_full_name, ''));
  _clean_code text := trim(COALESCE(_employee_code, ''));
  _clean_email text := nullif(lower(trim(COALESCE(_email, ''))), '');
  _user_id uuid;
  _employee_id uuid;
  _encrypted_pw text;
BEGIN
  -- Strict HR check
  IF NOT public.is_hr() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Validate required fields
  IF _clean_name = '' THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;
  IF _clean_code = '' THEN
    RAISE EXCEPTION 'employee_code_required';
  END IF;
  IF _clean_email IS NULL OR _clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF _password IS NULL OR length(_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  -- Duplicate checks
  IF EXISTS (SELECT 1 FROM public.employees WHERE employee_code = _clean_code) THEN
    RAISE EXCEPTION 'employee_code_exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees WHERE lower(email) = _clean_email) THEN
    RAISE EXCEPTION 'email_exists';
  END IF;

  -- Check if Auth user already exists with this email
  SELECT id INTO _user_id FROM auth.users WHERE lower(email) = _clean_email LIMIT 1;

  IF _user_id IS NOT NULL THEN
    -- Check if that Auth user is already linked to another employee
    IF EXISTS (SELECT 1 FROM public.employees WHERE profile_id = _user_id) THEN
      RAISE EXCEPTION 'auth_account_already_linked';
    END IF;

    -- Update existing auth user password & metadata
    _encrypted_pw := crypt(_password, gen_salt('bf'));
    UPDATE auth.users
       SET encrypted_password = _encrypted_pw,
           raw_user_meta_data = jsonb_build_object('full_name', _clean_name),
           banned_until = CASE WHEN _is_active THEN NULL ELSE now() + interval '100 years' END,
           updated_at = now()
     WHERE id = _user_id;

    UPDATE public.profiles
       SET full_name = _clean_name,
           email = _clean_email,
           updated_at = now()
     WHERE id = _user_id;
  ELSE
    -- Create new Auth user
    _user_id := gen_random_uuid();
    _encrypted_pw := crypt(_password, gen_salt('bf'));

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      banned_until,
      created_at,
      updated_at
    ) VALUES (
      _user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      _clean_email,
      _encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', _clean_name),
      CASE WHEN _is_active THEN NULL ELSE now() + interval '100 years' END,
      now(),
      now()
    );

    -- Ensure profile exists
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (_user_id, _clean_name, _clean_email)
    ON CONFLICT (id) DO UPDATE
      SET full_name = _clean_name,
          email = _clean_email,
          updated_at = now();
  END IF;

  -- Assign user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- If a different role is specified, ensure other non-HR roles are cleared
  IF _role <> 'employee' THEN
    DELETE FROM public.user_roles
     WHERE user_id = _user_id
       AND role NOT IN (_role, 'hr');
  END IF;

  -- Create employee record
  INSERT INTO public.employees (
    employee_code,
    full_name,
    email,
    department_id,
    job_title,
    supervisor_id,
    manager_id,
    requires_manager_approval,
    is_active,
    profile_id
  ) VALUES (
    _clean_code,
    _clean_name,
    _clean_email,
    _department_id,
    nullif(trim(COALESCE(_job_title, '')), ''),
    _supervisor_id,
    _manager_id,
    _requires_manager_approval,
    _is_active,
    _user_id
  ) RETURNING id INTO _employee_id;

  -- Audit log entry
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (
    auth.uid(),
    'hr_create_employee_account',
    'employees',
    _employee_id,
    jsonb_build_object(
      'employee_id', _employee_id,
      'user_id', _user_id,
      'employee_code', _clean_code,
      'full_name', _clean_name,
      'email', _clean_email,
      'role', _role,
      'is_active', _is_active
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', _employee_id,
    'user_id', _user_id
  );
END;
$$;

-- 2. Function: HR Update Employee Account
CREATE OR REPLACE FUNCTION public.hr_update_employee_account(
  _employee_id uuid,
  _full_name text,
  _employee_code text,
  _email text,
  _role public.app_role,
  _department_id uuid DEFAULT NULL,
  _job_title text DEFAULT NULL,
  _supervisor_id uuid DEFAULT NULL,
  _manager_id uuid DEFAULT NULL,
  _requires_manager_approval boolean DEFAULT true,
  _is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _clean_name text := trim(COALESCE(_full_name, ''));
  _clean_code text := trim(COALESCE(_employee_code, ''));
  _clean_email text := nullif(lower(trim(COALESCE(_email, ''))), '');
  _profile_id uuid;
  _old_emp record;
BEGIN
  IF NOT public.is_hr() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _clean_name = '' THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF _clean_code = '' THEN RAISE EXCEPTION 'employee_code_required'; END IF;
  IF _clean_email IS NOT NULL AND _clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  SELECT * INTO _old_emp FROM public.employees WHERE id = _employee_id;
  IF _old_emp.id IS NULL THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;

  -- Duplicate checks against other employees
  IF EXISTS (SELECT 1 FROM public.employees WHERE employee_code = _clean_code AND id <> _employee_id) THEN
    RAISE EXCEPTION 'employee_code_exists';
  END IF;
  IF _clean_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees WHERE lower(email) = _clean_email AND id <> _employee_id) THEN
    RAISE EXCEPTION 'email_exists';
  END IF;

  _profile_id := _old_emp.profile_id;

  -- Update employee record
  UPDATE public.employees
     SET employee_code = _clean_code,
         full_name = _clean_name,
         email = _clean_email,
         department_id = _department_id,
         job_title = nullif(trim(COALESCE(_job_title, '')), ''),
         supervisor_id = _supervisor_id,
         manager_id = _manager_id,
         requires_manager_approval = _requires_manager_approval,
         is_active = _is_active,
         updated_at = now()
   WHERE id = _employee_id;

  -- If linked to auth user, sync status, email, and role
  IF _profile_id IS NOT NULL THEN
    -- Update Auth user banned status
    UPDATE auth.users
       SET banned_until = CASE WHEN _is_active THEN NULL ELSE now() + interval '100 years' END,
           raw_user_meta_data = jsonb_build_object('full_name', _clean_name),
           updated_at = now()
     WHERE id = _profile_id;

    -- Update Profile
    UPDATE public.profiles
       SET full_name = _clean_name,
           email = COALESCE(_clean_email, email),
           updated_at = now()
     WHERE id = _profile_id;

    -- Update user roles
    IF _role IS NOT NULL THEN
      -- Replace role (unless user also has HR role, which is preserved)
      DELETE FROM public.user_roles
       WHERE user_id = _profile_id
         AND role NOT IN (_role, 'hr');

      INSERT INTO public.user_roles (user_id, role)
      VALUES (_profile_id, _role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'employee_id', _employee_id);
END;
$$;

-- 3. Function: HR Reset Employee Password
CREATE OR REPLACE FUNCTION public.hr_reset_employee_password(
  _employee_id uuid,
  _new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _profile_id uuid;
  _encrypted_pw text;
BEGIN
  IF NOT public.is_hr() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _new_password IS NULL OR length(_new_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  SELECT profile_id INTO _profile_id FROM public.employees WHERE id = _employee_id;
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'account_not_linked';
  END IF;

  _encrypted_pw := crypt(_new_password, gen_salt('bf'));

  UPDATE auth.users
     SET encrypted_password = _encrypted_pw,
         updated_at = now()
   WHERE id = _profile_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (
    auth.uid(),
    'hr_reset_password',
    'employees',
    _employee_id,
    jsonb_build_object('employee_id', _employee_id, 'profile_id', _profile_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Function: HR Toggle Employee Account Status (Enable/Disable)
CREATE OR REPLACE FUNCTION public.hr_toggle_account_status(
  _employee_id uuid,
  _is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _profile_id uuid;
BEGIN
  IF NOT public.is_hr() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.employees
     SET is_active = _is_active,
         updated_at = now()
   WHERE id = _employee_id
   RETURNING profile_id INTO _profile_id;

  IF _profile_id IS NOT NULL THEN
    UPDATE auth.users
       SET banned_until = CASE WHEN _is_active THEN NULL ELSE now() + interval '100 years' END,
           updated_at = now()
     WHERE id = _profile_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'is_active', _is_active);
END;
$$;

-- 5. Function: HR Link Existing Account to Employee
CREATE OR REPLACE FUNCTION public.hr_link_employee_to_account(
  _employee_id uuid,
  _user_id uuid,
  _role public.app_role DEFAULT 'employee'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _user_email text;
  _user_name text;
BEGIN
  IF NOT public.is_hr() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Ensure employee exists and is not already linked
  IF EXISTS (SELECT 1 FROM public.employees WHERE id = _employee_id AND profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'employee_already_linked';
  END IF;

  -- Ensure user exists and is not already linked
  IF EXISTS (SELECT 1 FROM public.employees WHERE profile_id = _user_id AND id <> _employee_id) THEN
    RAISE EXCEPTION 'auth_account_already_linked';
  END IF;

  SELECT email, raw_user_meta_data ->> 'full_name'
    INTO _user_email, _user_name
    FROM auth.users
   WHERE id = _user_id;

  IF _user_email IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Update employee profile_id and email if empty
  UPDATE public.employees
     SET profile_id = _user_id,
         email = COALESCE(email, lower(_user_email)),
         updated_at = now()
   WHERE id = _employee_id;

  -- Assign user role
  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
  VALUES (
    auth.uid(),
    'hr_link_account',
    'employees',
    _employee_id,
    jsonb_build_object('employee_id', _employee_id, 'profile_id', _user_id, 'role', _role)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. View & Function: HR Accounts Detailed Listing
CREATE OR REPLACE FUNCTION public.hr_list_employee_accounts(
  _search text DEFAULT '',
  _department_id text DEFAULT 'all',
  _role text DEFAULT 'all',
  _status text DEFAULT 'all',
  _account_status text DEFAULT 'all'
)
RETURNS TABLE (
  id uuid,
  employee_code text,
  full_name text,
  email text,
  job_title text,
  is_active boolean,
  requires_manager_approval boolean,
  department_id uuid,
  department_name text,
  supervisor_id uuid,
  supervisor_name text,
  manager_id uuid,
  manager_name text,
  profile_id uuid,
  role public.app_role,
  roles public.app_role[],
  created_at timestamptz,
  user_created_at timestamptz,
  is_banned boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.is_hr() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.employee_code,
    e.full_name,
    e.email,
    e.job_title,
    e.is_active,
    e.requires_manager_approval,
    e.department_id,
    d.name AS department_name,
    e.supervisor_id,
    s.full_name AS supervisor_name,
    e.manager_id,
    m.full_name AS manager_name,
    e.profile_id,
    COALESCE(
      (SELECT r.role FROM public.user_roles r
        WHERE r.user_id = e.profile_id
        ORDER BY CASE r.role
          WHEN 'hr' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'supervisor' THEN 3
          ELSE 4 END
        LIMIT 1),
      'employee'::public.app_role
    ) AS role,
    COALESCE(
      (SELECT array_agg(r.role ORDER BY r.role)
         FROM public.user_roles r
        WHERE r.user_id = e.profile_id),
      ARRAY[]::public.app_role[]
    ) AS roles,
    e.created_at,
    u.created_at AS user_created_at,
    (u.banned_until IS NOT NULL AND u.banned_until > now()) AS is_banned
  FROM public.employees e
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.employees s ON s.id = e.supervisor_id
  LEFT JOIN public.employees m ON m.id = e.manager_id
  LEFT JOIN auth.users u ON u.id = e.profile_id
  WHERE
    (_search = '' OR (
      e.full_name ILIKE '%' || _search || '%' OR
      e.employee_code ILIKE '%' || _search || '%' OR
      COALESCE(e.email, '') ILIKE '%' || _search || '%'
    ))
    AND (_department_id = 'all' OR e.department_id = _department_id::uuid)
    AND (_status = 'all' OR e.is_active = (_status = 'active'))
    AND (_account_status = 'all' OR (
      (_account_status = 'linked' AND e.profile_id IS NOT NULL) OR
      (_account_status = 'unlinked' AND e.profile_id IS NULL)
    ))
    AND (_role = 'all' OR EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = e.profile_id AND ur.role = _role::public.app_role
    ))
  ORDER BY e.employee_code ASC;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.hr_create_employee_account FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_create_employee_account TO authenticated;

REVOKE ALL ON FUNCTION public.hr_update_employee_account FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_update_employee_account TO authenticated;

REVOKE ALL ON FUNCTION public.hr_reset_employee_password FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_reset_employee_password TO authenticated;

REVOKE ALL ON FUNCTION public.hr_toggle_account_status FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_toggle_account_status TO authenticated;

REVOKE ALL ON FUNCTION public.hr_link_employee_to_account FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_link_employee_to_account TO authenticated;

REVOKE ALL ON FUNCTION public.hr_list_employee_accounts FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_list_employee_accounts TO authenticated;

