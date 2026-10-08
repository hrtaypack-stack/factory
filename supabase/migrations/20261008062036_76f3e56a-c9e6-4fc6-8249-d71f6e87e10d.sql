CREATE OR REPLACE FUNCTION public.unlinked_accounts()
RETURNS TABLE(user_id uuid, email text, full_name text, roles app_role[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_hr() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT u.id, lower(u.email)::text, coalesce(nullif(p.full_name,''), '')::text,
         coalesce((SELECT array_agg(r.role ORDER BY r.role) FROM public.user_roles r WHERE r.user_id = u.id), ARRAY[]::app_role[])
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.profile_id = u.id)
   ORDER BY u.created_at;
END; $$;
REVOKE EXECUTE ON FUNCTION public.unlinked_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlinked_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), lower(NEW.email))
  ON CONFLICT (id) DO UPDATE SET email = COALESCE(public.profiles.email, EXCLUDED.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.employees SET profile_id = NEW.id
   WHERE profile_id IS NULL AND email IS NOT NULL AND lower(email) = lower(NEW.email);
  RETURN NEW;
END; $function$;