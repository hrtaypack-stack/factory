DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.employees_import(jsonb,boolean,boolean)'::regprocedure);
  d := regexp_replace(d, 'errors \|\| (''[^'']*'')', 'array_append(errors, \1::text)', 'g');
  EXECUTE d;
END $$;
REVOKE EXECUTE ON FUNCTION public.employees_import(jsonb,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employees_import(jsonb,boolean,boolean) TO authenticated;