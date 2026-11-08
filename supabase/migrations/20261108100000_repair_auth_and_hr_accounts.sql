-- Migration: Repair Auth Identities and Enhance HR Account Management
-- 1. Targeted repair of existing accounts missing auth.identities
-- 2. Enhance hr_create_employee_account to always populate auth.identities
-- 3. Provide hr_complete_employee_account for Supabase Admin API workflows

-- ============================================================================
-- 1. Targeted Repair for existing affected accounts
-- ============================================================================
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', lower(u.email), 'email_verified', true),
  'email',
  u.id::text,
  now(),
  u.created_at,
  now()
FROM auth.users u
JOIN public.employees e ON e.profile_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i
   WHERE i.user_id = u.id AND i.provider = 'email'
);

-- ============================================================================
-- 2. Enhanced hr_create_employee_account (Atomic Database Fallback)
-- ============================================================================
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

    -- Ensure identity exists in auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      _user_id::text,
      _user_id,
      jsonb_build_object('sub', _user_id::text, 'email', _clean_email, 'email_verified', true),
      'email',
      _user_id::text,
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider, id) DO UPDATE
      SET identity_data = jsonb_build_object('sub', _user_id::text, 'email', _clean_email, 'email_verified', true),
          updated_at = now();

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

    -- Ensure identity exists in auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      _user_id::text,
      _user_id,
      jsonb_build_object('sub', _user_id::text, 'email', _clean_email, 'email_verified', true),
      'email',
      _user_id::text,
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider, id) DO NOTHING;

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

-- ============================================================================
-- 3. Function: hr_complete_employee_account (Used with Admin API)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hr_complete_employee_account(
  _user_id uuid,
  _employee_code text,
  _full_name text,
  _email text,
  _role public.app_role DEFAULT 'employee',
  _department_id uuid DEFAULT NULL,
  _job_title text DEFAULT NULL,
  _supervisor_id uuid DEFAULT NULL,
  _manager_id uuid DEFAULT NULL,
  _requires_manager_approval boolean DEFAULT true,
  _is_active boolean DEFAULT true,
  _caller_id uuid DEFAULT NULL
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
  _employee_id uuid;
  _auth_uid uuid := COALESCE(auth.uid(), _caller_id);
BEGIN
  -- Strict HR check: caller must be HR or called via secure service_role with validated HR caller
  IF NOT public.is_hr() THEN
    IF _caller_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _caller_id AND role = 'hr'
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Validate required fields
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _clean_name = '' THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF _clean_code = '' THEN RAISE EXCEPTION 'employee_code_required'; END IF;
  IF _clean_email IS NULL OR _clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  -- Duplicate checks
  IF EXISTS (SELECT 1 FROM public.employees WHERE employee_code = _clean_code) THEN
    RAISE EXCEPTION 'employee_code_exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees WHERE lower(email) = _clean_email) THEN
    RAISE EXCEPTION 'email_exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees WHERE profile_id = _user_id) THEN
    RAISE EXCEPTION 'auth_account_already_linked';
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (_user_id, _clean_name, _clean_email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = _clean_name,
        email = _clean_email,
        updated_at = now();

  -- Clear previous non-HR roles and set assigned role
  IF _role <> 'employee' THEN
    DELETE FROM public.user_roles
     WHERE user_id = _user_id
       AND role NOT IN (_role, 'hr');
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

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
    _auth_uid,
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

-- Permissions
GRANT EXECUTE ON FUNCTION public.hr_complete_employee_account TO authenticated, service_role;

