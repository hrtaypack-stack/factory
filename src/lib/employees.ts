import { supabase } from "@/integrations/supabase/client";

export interface PersonRef {
  id: string;
  employee_code: string;
  full_name: string;
}

export interface EmployeeAdminRow {
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
  profile_id: string | null;
  departments: { id: string; name: string } | null;
  supervisor: PersonRef | null;
  manager: PersonRef | null;
}

export interface EmployeeFilters {
  term: string;
  departmentId: string;
  supervisorId: string;
  managerId: string;
  status: string; // all | active | inactive
  account: string; // all | linked | unlinked
}

export const EMPTY_EMPLOYEE_FILTERS: EmployeeFilters = {
  term: "",
  departmentId: "all",
  supervisorId: "all",
  managerId: "all",
  status: "all",
  account: "all",
};

export const EMPLOYEE_PAGE_SIZE = 50;

const EMPLOYEE_SELECT =
  "id, employee_code, full_name, email, job_title, is_active, requires_manager_approval, department_id, supervisor_id, manager_id, profile_id, " +
  "departments(id, name), " +
  "supervisor:supervisor_id(id, employee_code, full_name), " +
  "manager:manager_id(id, employee_code, full_name)";

function normalizePerson(val: unknown): PersonRef | null {
  if (!val) return null;
  if (Array.isArray(val)) {
    return (val[0] as PersonRef) ?? null;
  }
  return val as PersonRef;
}

/**
 * Sanitize free text before it is placed inside a PostgREST filter string.
 * Removes every character that has syntactic meaning in `or()` / `ilike`
 * expressions (separators, grouping, quoting, escaping, wildcards).
 */
export function safeTerm(t: string): string {
  return t.replace(/[,()*%"'\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function fetchEmployeesAdmin(f: EmployeeFilters, page: number) {
  let q: any = supabase
    .from("employees")
    .select(EMPLOYEE_SELECT, { count: "exact" })
    .order("employee_code")
    .range(page * EMPLOYEE_PAGE_SIZE, page * EMPLOYEE_PAGE_SIZE + EMPLOYEE_PAGE_SIZE - 1);
  const t = safeTerm(f.term);
  if (t) q = q.or(`employee_code.ilike.%${t}%,full_name.ilike.%${t}%,email.ilike.%${t}%`);
  if (f.departmentId !== "all") q = q.eq("department_id", f.departmentId);
  if (f.supervisorId !== "all") q = q.eq("supervisor_id", f.supervisorId);
  if (f.managerId !== "all") q = q.eq("manager_id", f.managerId);
  if (f.status !== "all") q = q.eq("is_active", f.status === "active");
  if (f.account === "linked") q = q.not("profile_id", "is", null);
  if (f.account === "unlinked") q = q.is("profile_id", null);
  const { data, error, count } = await q;
  if (error) throw error;
  const rows = ((data ?? []) as any[]).map((r) => ({
    ...r,
    supervisor: normalizePerson(r.supervisor),
    manager: normalizePerson(r.manager),
  })) as EmployeeAdminRow[];
  return { rows, total: count ?? 0 };
}

/** Employees whose linked account holds the given role (supervisors / managers). */
export async function fetchPeopleWithRole(role: "supervisor" | "manager"): Promise<PersonRef[]> {
  const { data: roleRows, error } = await supabase.from("user_roles").select("user_id").eq("role", role);
  if (error) throw error;
  const ids = (roleRows ?? []).map((r) => r.user_id);
  if (ids.length === 0) return [];
  const { data, error: e2 } = await supabase
    .from("employees")
    .select("id, employee_code, full_name")
    .in("profile_id", ids)
    .order("full_name");
  if (e2) throw e2;
  return data ?? [];
}

export function employeeErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  const code = (err as { code?: string })?.code;
  if (code === "23505" || msg.includes("duplicate key")) {
    if (msg.includes("email")) return "البريد الإلكتروني مستخدم لموظف آخر.";
    return "كود الموظف مستخدم بالفعل لموظف آخر.";
  }
  if (msg.includes("circular_relationship"))
    return "لا يمكن حفظ العلاقة لأنها تُنشئ تسلسلًا دائريًا بين المشرف والمدير.";
  if (msg.includes("self_relationship")) return "لا يمكن أن يكون الموظف مشرفًا أو مديرًا لنفسه.";
  if (msg.includes("employee_code_required")) return "كود الموظف مطلوب.";
  if (msg.includes("full_name_required")) return "اسم الموظف مطلوب.";
  if (msg.includes("invalid_email")) return "البريد الإلكتروني غير صحيح.";
  if (msg.includes("forbidden") || code === "42501") return "لا تملك صلاحية تنفيذ هذه العملية.";
  if (msg.includes("too_many_rows")) return "الملف يحتوي على أكثر من ٥٠٠٠ صف. يرجى تقسيمه.";
  return "تعذّر حفظ البيانات، يرجى المحاولة مرة أخرى.";
}
