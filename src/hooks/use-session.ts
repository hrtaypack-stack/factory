import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { primaryRole, type AppRole } from "@/lib/labels";

export interface EmployeeRecord {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  is_active: boolean;
  requires_manager_approval: boolean;
  department_id: string | null;
  supervisor_id: string | null;
  manager_id: string | null;
}

export interface SessionInfo {
  userId: string;
  email: string | null;
  fullName: string;
  roles: AppRole[];
  role: AppRole;
  employee: EmployeeRecord | null;
}

export const sessionQueryKey = ["session"] as const;

export async function fetchSessionInfo(): Promise<SessionInfo | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;
  const user = userData.user;

  const [profileRes, rolesRes, employeeRes] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("employees")
      .select(
        "id, employee_code, full_name, email, job_title, is_active, requires_manager_approval, department_id, supervisor_id, manager_id",
      )
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  if (rolesRes.error) throw rolesRes.error;

  const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName:
      profileRes.data?.full_name?.trim() ||
      employeeRes.data?.full_name?.trim() ||
      (user.email ?? "مستخدم"),
    roles,
    role: primaryRole(roles),
    employee: (employeeRes.data as EmployeeRecord | null) ?? null,
  };
}

export function useSession(): UseQueryResult<SessionInfo | null> {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSessionInfo,
    staleTime: 60_000,
  });
}
