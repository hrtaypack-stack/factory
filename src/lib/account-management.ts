import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/labels";
import { safeTerm } from "@/lib/employees";

export interface AccountRow {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  is_active: boolean;
  requires_manager_approval: boolean;
  department_id: string | null;
  department_name: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  profile_id: string | null;
  role: AppRole;
  roles: AppRole[];
  created_at: string;
  user_created_at: string | null;
  is_banned: boolean;
}

export interface AccountFilters {
  search: string;
  departmentId: string;
  role: string;
  status: string;
  accountStatus: string;
}

export const EMPTY_ACCOUNT_FILTERS: AccountFilters = {
  search: "",
  departmentId: "all",
  role: "all",
  status: "all",
  accountStatus: "all",
};

export interface CreateAccountPayload {
  full_name: string;
  employee_code: string;
  email: string;
  password: string;
  role: AppRole;
  department_id?: string | null;
  job_title?: string | null;
  supervisor_id?: string | null;
  manager_id?: string | null;
  requires_manager_approval?: boolean;
  is_active?: boolean;
}

export interface UpdateAccountPayload {
  employee_id: string;
  full_name: string;
  employee_code: string;
  email: string;
  role: AppRole;
  department_id?: string | null;
  job_title?: string | null;
  supervisor_id?: string | null;
  manager_id?: string | null;
  requires_manager_approval?: boolean;
  is_active?: boolean;
}

/**
 * Fetch employee accounts with robust fallback.
 * First tries the dedicated RPC function `hr_list_employee_accounts`.
 * If not present in schema, falls back to direct query on `employees` joined with `user_roles`.
 */
export async function fetchEmployeeAccounts(f: AccountFilters): Promise<AccountRow[]> {
  const searchTerm = safeTerm(f.search);

  try {
    const { data, error } = await supabase.rpc("hr_list_employee_accounts", {
      _search: searchTerm,
      _department_id: f.departmentId,
      _role: f.role,
      _status: f.status,
      _account_status: f.accountStatus,
    });

    if (!error && Array.isArray(data)) {
      return data as AccountRow[];
    }
  } catch {
    // fall back to direct query
  }

  // Fallback query using Supabase client with RLS
  let q = supabase
    .from("employees")
    .select(
      `
      id,
      employee_code,
      full_name,
      email,
      job_title,
      is_active,
      requires_manager_approval,
      department_id,
      departments(name),
      supervisor_id,
      supervisor:supervisor_id(full_name),
      manager_id,
      manager:manager_id(full_name),
      profile_id,
      created_at
    `,
    )
    .order("employee_code");

  if (searchTerm) {
    q = q.or(
      `employee_code.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`,
    );
  }
  if (f.departmentId !== "all") q = q.eq("department_id", f.departmentId);
  if (f.status !== "all") q = q.eq("is_active", f.status === "active");
  if (f.accountStatus === "linked") q = q.not("profile_id", "is", null);
  if (f.accountStatus === "unlinked") q = q.is("profile_id", null);

  const { data: empData, error: empError } = await q;
  if (empError) throw empError;

  interface RawEmpRow {
    id: string;
    employee_code: string;
    full_name: string;
    email: string | null;
    job_title: string | null;
    is_active: boolean;
    requires_manager_approval: boolean;
    department_id: string | null;
    departments: { name: string } | null;
    supervisor_id: string | null;
    supervisor: { full_name: string } | { full_name: string }[] | null;
    manager_id: string | null;
    manager: { full_name: string } | { full_name: string }[] | null;
    profile_id: string | null;
    created_at: string;
  }

  const rawEmployees = (empData ?? []) as unknown as RawEmpRow[];
  const profileIds = rawEmployees
    .map((e) => e.profile_id)
    .filter((id): id is string => Boolean(id));
  const rolesByUser: Record<string, AppRole[]> = {};

  if (profileIds.length > 0) {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", profileIds);

    for (const r of roleRows ?? []) {
      if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
      rolesByUser[r.user_id]!.push(r.role as AppRole);
    }
  }

  const rows: AccountRow[] = rawEmployees.map((e) => {
    const userRoles = e.profile_id ? (rolesByUser[e.profile_id] ?? ["employee"]) : [];
    const primaryRole: AppRole = userRoles.includes("hr")
      ? "hr"
      : userRoles.includes("manager")
        ? "manager"
        : userRoles.includes("supervisor")
          ? "supervisor"
          : "employee";

    return {
      id: e.id,
      employee_code: e.employee_code,
      full_name: e.full_name,
      email: e.email,
      job_title: e.job_title,
      is_active: e.is_active,
      requires_manager_approval: e.requires_manager_approval,
      department_id: e.department_id,
      department_name: e.departments?.name ?? null,
      supervisor_id: e.supervisor_id,
      supervisor_name:
        (Array.isArray(e.supervisor) ? e.supervisor[0]?.full_name : e.supervisor?.full_name) ??
        null,
      manager_id: e.manager_id,
      manager_name:
        (Array.isArray(e.manager) ? e.manager[0]?.full_name : e.manager?.full_name) ?? null,
      profile_id: e.profile_id,
      role: primaryRole,
      roles: userRoles,
      created_at: e.created_at,
      user_created_at: null,
      is_banned: !e.is_active,
    };
  });

  if (f.role !== "all") {
    return rows.filter((r) => r.roles.includes(f.role as AppRole));
  }

  return rows;
}

/**
 * Create a new employee with auth account securely.
 * Attempts Edge Function invocation, falling back to secure database RPC.
 */
export async function createEmployeeAccount(payload: CreateAccountPayload) {
  try {
    const { data, error } = await supabase.functions.invoke("manage-account", {
      body: { action: "create_account", ...payload },
    });
    if (!error && (data?.success || data?.employee_id)) return data;
    if (error) {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          if (body?.error) throw new Error(body.error);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          if (errMsg && errMsg !== "[object Object]") throw e;
        }
      }
    }
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (
      msg.includes("employee_code_exists") ||
      msg.includes("email_exists") ||
      msg.includes("auth_account_already_linked") ||
      msg.includes("password_too_short") ||
      msg.includes("forbidden")
    ) {
      throw err;
    }
  }

  const { data, error } = await supabase.rpc("hr_create_employee_account", {
    _full_name: payload.full_name,
    _employee_code: payload.employee_code,
    _email: payload.email,
    _password: payload.password,
    _role: payload.role,
    _department_id: payload.department_id || undefined,
    _job_title: payload.job_title || undefined,
    _supervisor_id: payload.supervisor_id || undefined,
    _manager_id: payload.manager_id || undefined,
    _requires_manager_approval: payload.requires_manager_approval ?? true,
    _is_active: payload.is_active ?? true,
  });

  if (error) throw error;
  return data;
}

/**
 * Update an existing employee account.
 */
export async function updateEmployeeAccount(payload: UpdateAccountPayload) {
  try {
    const { data, error } = await supabase.functions.invoke("manage-account", {
      body: { action: "update_account", ...payload },
    });
    if (!error && data?.success) return data;
  } catch {
    // continue to direct RPC
  }

  const { data, error } = await supabase.rpc("hr_update_employee_account", {
    _employee_id: payload.employee_id,
    _full_name: payload.full_name,
    _employee_code: payload.employee_code,
    _email: payload.email,
    _role: payload.role,
    _department_id: payload.department_id || undefined,
    _job_title: payload.job_title || undefined,
    _supervisor_id: payload.supervisor_id || undefined,
    _manager_id: payload.manager_id || undefined,
    _requires_manager_approval: payload.requires_manager_approval ?? true,
    _is_active: payload.is_active ?? true,
  });

  if (error) throw error;
  return data;
}

/**
 * Reset an employee account's password.
 */
export async function resetEmployeePassword(employeeId: string, newPassword: string) {
  try {
    const { data, error } = await supabase.functions.invoke("manage-account", {
      body: { action: "reset_password", employee_id: employeeId, new_password: newPassword },
    });
    if (!error && data?.success) return data;
  } catch {
    // continue to direct RPC
  }

  const { data, error } = await supabase.rpc("hr_reset_employee_password", {
    _employee_id: employeeId,
    _new_password: newPassword,
  });

  if (error) throw error;
  return data;
}

/**
 * Enable or disable an employee account.
 */
export async function toggleAccountStatus(employeeId: string, isActive: boolean) {
  try {
    const { data, error } = await supabase.functions.invoke("manage-account", {
      body: { action: "toggle_status", employee_id: employeeId, is_active: isActive },
    });
    if (!error && data?.success) return data;
  } catch {
    // continue to direct RPC
  }

  const { data, error } = await supabase.rpc("hr_toggle_account_status", {
    _employee_id: employeeId,
    _is_active: isActive,
  });

  if (error) throw error;
  return data;
}

/**
 * Link an existing unlinked auth account to an employee record.
 */
export async function linkEmployeeToAccount(employeeId: string, userId: string, role: AppRole) {
  try {
    const { data, error } = await supabase.functions.invoke("manage-account", {
      body: { action: "link_account", employee_id: employeeId, user_id: userId, role },
    });
    if (!error && data?.success) return data;
  } catch {
    // continue to direct RPC
  }

  const { data, error } = await supabase.rpc("hr_link_employee_to_account", {
    _employee_id: employeeId,
    _user_id: userId,
    _role: role,
  });

  if (error) throw error;
  return data;
}

/**
 * Fetch unlinked auth accounts for linking.
 */
export async function fetchUnlinkedAccounts() {
  const { data, error } = await supabase.rpc("unlinked_accounts");
  if (error) throw error;
  return data ?? [];
}

/**
 * Translate backend errors to clear Arabic error messages.
 */
export function accountErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase();
  const code = (err as { code?: string })?.code;

  if (msg.includes("employee_code_exists") || (code === "23505" && msg.includes("employee_code"))) {
    return "كود الموظف مستخدم بالفعل لموظف آخر.";
  }
  if (msg.includes("email_exists") || (code === "23505" && msg.includes("email"))) {
    return "البريد الإلكتروني مسجل بالفعل لموظف آخر.";
  }
  if (msg.includes("auth_account_already_linked")) {
    return "حساب المستخدم مسجل ومربوط بالفعل بموظف آخر.";
  }
  if (msg.includes("employee_already_linked")) {
    return "ملف الموظف مربوط بالفعل بحساب مستخدم.";
  }
  if (msg.includes("account_not_linked")) {
    return "لا يمكن تغيير كلمة المرور لأن الموظف غير مربوط بحساب دخول بعد.";
  }
  if (msg.includes("password_too_short")) {
    return "كلمة المرور قصيرة جدًا، يجب أن تتكون من ٦ أحرف على الأقل.";
  }
  if (msg.includes("full_name_required")) {
    return "اسم الموظف مطلوب.";
  }
  if (msg.includes("employee_code_required")) {
    return "كود الموظف مطلوب.";
  }
  if (msg.includes("invalid_email")) {
    return "صيغة البريد الإلكتروني غير صحيحة.";
  }
  if (msg.includes("self_relationship")) {
    return "لا يمكن للموظف أن يكون مشرفاً أو مديراً لنفسه.";
  }
  if (msg.includes("circular_relationship")) {
    return "لا يمكن حفظ التدرج الإداري لوجود علاقة دائرية بين المشرف والمدير.";
  }
  if (msg.includes("forbidden") || code === "42501") {
    return "لا تملك الصلاحية لتنفيذ هذه العملية، هذه الميزة مخصصة لمسؤولي الموارد البشرية فقط.";
  }
  return "حدث خطأ أثناء معالجة الحساب، يرجى المحاولة مرة أخرى.";
}
