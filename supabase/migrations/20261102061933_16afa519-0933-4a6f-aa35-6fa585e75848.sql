CREATE OR REPLACE FUNCTION public.reroute_pending_leave_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _needs_mgr boolean;
  _target request_status;
  _mgr uuid;
BEGIN
  IF NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id
     AND NEW.requires_manager_approval IS NOT DISTINCT FROM OLD.requires_manager_approval THEN
    RETURN NEW;
  END IF;

  _needs_mgr := NEW.requires_manager_approval AND NEW.manager_id IS NOT NULL;
  _target := CASE WHEN _needs_mgr THEN 'pending_manager'::request_status ELSE 'pending_hr'::request_status END;
  _mgr := CASE WHEN _needs_mgr THEN NEW.manager_id ELSE NULL END;

  FOR _r IN SELECT id, status, manager_id FROM public.leave_requests
             WHERE employee_id = NEW.id
               AND status IN ('pending_manager','pending_hr')
             FOR UPDATE
  LOOP
    IF _r.status IS DISTINCT FROM _target OR _r.manager_id IS DISTINCT FROM _mgr THEN
      UPDATE public.leave_requests
         SET status = _target,
             manager_id = _mgr,
             manager_decided_by = NULL,
             manager_decided_at = NULL
       WHERE id = _r.id;

      IF current_setting('app.skip_row_audit', true) IS DISTINCT FROM 'on' THEN
        INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
        VALUES (auth.uid(), 'leave_request_rerouted', 'leave_requests', _r.id,
                jsonb_build_object('status', _r.status, 'manager_id', _r.manager_id),
                jsonb_build_object('status', _target, 'manager_id', _mgr,
                                   'reason', 'employee_manager_changed'));
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_reroute_pending_leaves
AFTER UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.reroute_pending_leave_route();

-- One-time correction: apply the current approval configuration to requests still awaiting approval
WITH cfg AS (
  SELECT e.id AS employee_id,
         (e.requires_manager_approval AND e.manager_id IS NOT NULL) AS needs_mgr,
         e.manager_id AS mgr
  FROM public.employees e
), changed AS (
  UPDATE public.leave_requests lr
     SET status = CASE WHEN cfg.needs_mgr THEN 'pending_manager' ELSE 'pending_hr' END::request_status,
         manager_id = CASE WHEN cfg.needs_mgr THEN cfg.mgr ELSE NULL END,
         manager_decided_by = NULL,
         manager_decided_at = NULL
    FROM cfg
   WHERE lr.employee_id = cfg.employee_id
     AND lr.status IN ('pending_manager','pending_hr')
     AND (lr.status IS DISTINCT FROM (CASE WHEN cfg.needs_mgr THEN 'pending_manager' ELSE 'pending_hr' END)::request_status
          OR lr.manager_id IS DISTINCT FROM (CASE WHEN cfg.needs_mgr THEN cfg.mgr ELSE NULL END))
  RETURNING lr.id, lr.status, lr.manager_id
)
INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
SELECT NULL, 'leave_request_rerouted', 'leave_requests', c.id,
       jsonb_build_object('status', c.status, 'manager_id', c.manager_id, 'reason', 'backfill_current_config')
FROM changed c;

REVOKE EXECUTE ON FUNCTION public.reroute_pending_leave_route() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reroute_pending_leave_route() TO authenticated;