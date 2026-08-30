import { supabase } from "@/integrations/supabase/client";
import type { RequestStatus } from "@/lib/labels";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface LeaveEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
  supervisor_id: string | null;
  manager_id: string | null;
  departments: { id: string; name: string } | null;
}

export interface LeaveRequestRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  submitted_by: string;
  manager_id: string | null;
  manager_decided_by: string | null;
  manager_decided_at: string | null;
  hr_decided_by: string | null;
  hr_decided_at: string | null;
  rejection_reason: string | null;
  employee: LeaveEmployee | null;
  leave_types: { id: string; name: string } | null;
}

export interface LeaveFilters {
  term: string;
  departmentId: string;
  leaveTypeId: string;
  status: string;
  supervisorId: string;
  managerId: string;
  from: string;
  to: string;
}

export const EMPTY_LEAVE_FILTERS: LeaveFilters = {
  term: "",
  departmentId: "all",
  leaveTypeId: "all",
  status: "all",
  supervisorId: "all",
  managerId: "all",
  from: "",
  to: "",
};

export const LEAVE_PAGE_SIZE = 25;

const LEAVE_SELECT =
  "id, employee_id, leave_type_id, start_date, end_date, days_count, reason, status, created_at, submitted_by, manager_id, manager_decided_by, manager_decided_at, hr_decided_by, hr_decided_at, rejection_reason, " +
  "employee:employees!leave_requests_employee_id_fkey!inner(id, employee_code, full_name, department_id, supervisor_id, manager_id, departments(id, name)), " +
  "leave_types!inner(id, name)";

/* ------------------------------------------------------------------ *
 * Business rules
 * ------------------------------------------------------------------ */

/** Inclusive calendar-day count for a leave range. Single source of truth. */
export function calcLeaveDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Statuses that HR may approve/reject directly. */
export const HR_ACTIONABLE: RequestStatus[] = ["pending_hr"];
/** Statuses a manager may act on. */
export const MANAGER_ACTIONABLE: RequestStatus[] = ["pending_manager"];
/** Statuses that still allow editing/cancelling by the submitter. */
export const EDITABLE_STATUSES: RequestStatus[] = ["pending_manager", "pending_hr"];

export function isEditable(status: RequestStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export interface LeaveListParams extends LeaveFilters {
  page: number;
  pageSize?: number;
  /** restrict to a single employee (employee self view) */
  employeeId?: string | null;
}

function applyFilters<T>(query: T, f: LeaveFilters): T {
  let q = query as any;
  const term = f.term.trim();
  if (term) {
    q = q.or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%`, {
      referencedTable: "employee",
    });
  }
  if (f.departmentId !== "all") q = q.eq("employee.department_id", f.departmentId);
  if (f.supervisorId !== "all") q = q.eq("employee.supervisor_id", f.supervisorId);
  if (f.managerId !== "all") q = q.eq("employee.manager_id", f.managerId);
  if (f.leaveTypeId !== "all") q = q.eq("leave_type_id", f.leaveTypeId);
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.from) q = q.gte("start_date", f.from);
  if (f.to) q = q.lte("end_date", f.to);
  return q as T;
}

export async function fetchLeaveRequests(params: LeaveListParams) {
  const pageSize = params.pageSize ?? LEAVE_PAGE_SIZE;
  const fromRow = params.page * pageSize;

  let query: any = supabase
    .from("leave_requests")
    .select(LEAVE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(fromRow, fromRow + pageSize - 1);

  if (params.employeeId) query = query.eq("employee_id", params.employeeId);
  query = applyFilters(query, params);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as LeaveRequestRow[], total: count ?? 0 };
}

/** Ids of every request matching the current filters (used by "select all results"). */
export async function fetchFilteredIds(params: LeaveListParams, max = 2000) {
  let query: any = supabase
    .from("leave_requests")
    .select("id, status, employee:employees!leave_requests_employee_id_fkey!inner(id), leave_types!inner(id)")
    .order("created_at", { ascending: false })
    .limit(max);
  if (params.employeeId) query = query.eq("employee_id", params.employeeId);
  query = applyFilters(query, params);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as { id: string; status: RequestStatus }[];
}

const COUNTED_STATUSES: RequestStatus[] = ["pending_manager", "pending_hr", "approved", "rejected"];

/** Real per-status counters. Also used by the dashboard. */
export async function fetchLeaveCounters(scope?: { employeeId?: string | null; managerId?: string | null }) {
  const entries = await Promise.all(
    COUNTED_STATUSES.map(async (status) => {
      let q: any = supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (scope?.employeeId) q = q.eq("employee_id", scope.employeeId);
      if (scope?.managerId) q = q.eq("manager_id", scope.managerId);
      const { count, error } = await q;
      if (error) throw error;
      return [status, count ?? 0] as const;
    }),
  );
  let totalQuery: any = supabase.from("leave_requests").select("id", { count: "exact", head: true });
  if (scope?.employeeId) totalQuery = totalQuery.eq("employee_id", scope.employeeId);
  if (scope?.managerId) totalQuery = totalQuery.eq("manager_id", scope.managerId);
  const { count: total, error: totalError } = await totalQuery;
  if (totalError) throw totalError;

  const map = Object.fromEntries(entries) as Record<RequestStatus, number>;
  return { ...map, total: total ?? 0 };
}

export async function fetchLeaveTypes(onlyActive = false) {
  let query = supabase
    .from("leave_types")
    .select("id, code, name, description, is_paid, max_days_per_year, is_active, created_at, updated_at")
    .order("name");
  if (onlyActive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDepartments() {
  const { data, error } = await supabase.from("departments").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

/** Employees the signed-in user may submit requests for (RLS already scopes this). */
export async function fetchSelectableEmployees(term: string) {
  let query = supabase
    .from("employees")
    .select("id, employee_code, full_name, job_title, department_id, departments(id, name)")
    .eq("is_active", true)
    .order("employee_code")
    .limit(50);
  const t = term.trim();
  if (t) query = query.or(`employee_code.ilike.%${t}%,full_name.ilike.%${t}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Supervisors / managers referenced by employees, for HR filters. */
export async function fetchSupervisorsAndManagers() {
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_code, full_name")
    .eq("is_active", true)
    .order("full_name")
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

/** Names of the people who submitted a set of requests (by auth user id). */
export async function fetchRequesters(userIds: string[]) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return {} as Record<string, string>;
  const { data } = await supabase
    .from("employees")
    .select("profile_id, full_name, employee_code")
    .in("profile_id", ids);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.profile_id) map[row.profile_id] = `${row.full_name} (${row.employee_code})`;
  }
  return map;
}

export async function fetchEmployeeChain(employee: LeaveEmployee | null) {
  const ids = [employee?.supervisor_id, employee?.manager_id].filter(Boolean) as string[];
  if (ids.length === 0) return {} as Record<string, string>;
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, employee_code")
    .in("id", ids);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.id] = `${row.full_name} (${row.employee_code})`;
  return map;
}

/* ------------------------------------------------------------------ *
 * Mutations (all workflow decisions happen inside the database)
 * ------------------------------------------------------------------ */

export interface LeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export async function submitLeaveRequest(input: LeaveRequestInput) {
  const { data, error } = await supabase.rpc("leave_request_submit", {
    _employee_id: input.employeeId,
    _leave_type_id: input.leaveTypeId,
    _start_date: input.startDate,
    _end_date: input.endDate,
    _reason: input.reason,
  });
  if (error) throw error;
  return data as string;
}

export async function updateLeaveRequest(id: string, input: Omit<LeaveRequestInput, "employeeId">) {
  const { error } = await supabase.rpc("leave_request_update", {
    _id: id,
    _leave_type_id: input.leaveTypeId,
    _start_date: input.startDate,
    _end_date: input.endDate,
    _reason: input.reason,
  });
  if (error) throw error;
}

export async function decideLeaveRequests(
  ids: string[],
  action: "approve" | "reject" | "cancel",
  reason?: string,
) {
  const { data, error } = await supabase.rpc("leave_request_decide", {
    _ids: ids,
    _action: action,
    _reason: reason ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

const DB_ERRORS: Record<string, string> = {
  not_authenticated: "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى",
  not_authorized: "لا تملك صلاحية تنفيذ هذا الإجراء",
  employee_not_found: "لم يتم العثور على الموظف",
  employee_inactive: "الموظف غير نشط ولا يمكن تقديم طلب له",
  leave_type_invalid: "نوع الإجازة غير صحيح أو غير مفعّل",
  end_date_before_start_date: "تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية",
  request_not_found: "لم يتم العثور على الطلب",
  request_not_editable: "لا يمكن تعديل الطلب في حالته الحالية",
  rejection_reason_required: "يرجى إدخال سبب الرفض",
  invalid_action: "إجراء غير صحيح",
};

export function leaveErrorMessage(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? "";
  for (const [key, msg] of Object.entries(DB_ERRORS)) {
    if (raw.includes(key)) return msg;
  }
  if (raw.toLowerCase().includes("duplicate")) return "هذا السجل موجود بالفعل";
  return "تعذّر إتمام العملية، يرجى المحاولة مرة أخرى";
}

/** Arabic date formatting used across the module. */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
