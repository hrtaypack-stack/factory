import { safeTerm } from "@/lib/employees";
import { supabase } from "@/integrations/supabase/client";
import type { RequestStatus } from "@/lib/labels";

/* ------------------------------------------------------------------ *
 * Shifts (single source of truth, mirrored by a database trigger)
 * ------------------------------------------------------------------ */

export const SHIFT_CODES = ["shift_1", "shift_2", "shift_3", "hours_4", "hours_12", "hours_16"] as const;
export type ShiftCode = (typeof SHIFT_CODES)[number];

export const SHIFT_LABELS: Record<ShiftCode, string> = {
  shift_1: "الوردية الأولى",
  shift_2: "الوردية الثانية",
  shift_3: "الوردية الثالثة",
  hours_4: "٤ ساعة",
  hours_12: "١٢ ساعة",
  hours_16: "١٦ ساعة",
};

export function shiftLabel(code: string | null): string {
  return code && code in SHIFT_LABELS ? SHIFT_LABELS[code as ShiftCode] : "—";
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface OvertimeEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  department_id: string | null;
  supervisor_id: string | null;
  manager_id: string | null;
  departments: { id: string; name: string } | null;
}

export interface OvertimeLine {
  id: string;
  employee_id: string;
  shift_code: string;
  employees: OvertimeEmployee | null;
}

export interface OvertimeRequestRow {
  id: string;
  work_date: string;
  notes: string | null;
  status: RequestStatus;
  created_at: string;
  submitted_by: string;
  manager_id: string | null;
  manager_decided_by: string | null;
  manager_decided_at: string | null;
  hr_decided_by: string | null;
  hr_decided_at: string | null;
  rejection_reason: string | null;
  department_id: string | null;
  departments: { id: string; name: string } | null;
  overtime_request_employees: OvertimeLine[];
}

export interface OvertimeFilters {
  term: string;
  departmentId: string;
  status: string;
  shift: string;
  supervisorId: string;
  managerId: string;
  from: string;
  to: string;
}

export const EMPTY_OVERTIME_FILTERS: OvertimeFilters = {
  term: "",
  departmentId: "all",
  status: "all",
  shift: "all",
  supervisorId: "all",
  managerId: "all",
  from: "",
  to: "",
};

export const OVERTIME_PAGE_SIZE = 25;

const OVERTIME_SELECT =
  "id, work_date, notes, status, created_at, submitted_by, manager_id, manager_decided_by, manager_decided_at, hr_decided_by, hr_decided_at, rejection_reason, department_id, " +
  "departments(id, name), " +
  "overtime_request_employees(id, employee_id, shift_code, employees:employees!overtime_request_employees_employee_id_fkey(id, employee_code, full_name, department_id, supervisor_id, manager_id, departments(id, name)))";

/* ------------------------------------------------------------------ *
 * Business rules (mirrored server-side)
 * ------------------------------------------------------------------ */

export const EDITABLE_OVERTIME_STATUSES: RequestStatus[] = [
  "pending_manager",
  "pending_hr",
  "rejected",
];

export function isOvertimeEditable(status: RequestStatus): boolean {
  return EDITABLE_OVERTIME_STATUSES.includes(status);
}

export const CANCELLABLE_OVERTIME_STATUSES: RequestStatus[] = ["pending_manager", "pending_hr"];

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export interface OvertimeListParams extends OvertimeFilters {
  page: number;
  pageSize?: number;
  /** restrict to assignments containing a single employee (employee self view) */
  employeeId?: string | null;
}

function hasEmployeeFilters(f: OvertimeFilters, employeeId?: string | null): boolean {
  return (
    !!f.term.trim() ||
    f.departmentId !== "all" ||
    f.supervisorId !== "all" ||
    f.managerId !== "all" ||
    f.shift !== "all" ||
    !!employeeId
  );
}

/**
 * Assignment ids whose employee lines match the employee-level filters.
 * Resolved separately so the returned assignments keep their FULL employee list.
 */
async function matchingRequestIds(
  f: OvertimeFilters,
  employeeId?: string | null,
  max = 5000,
): Promise<string[]> {
  let q: any = supabase
    .from("overtime_request_employees")
    .select(
      "overtime_request_id, shift_code, employees:employees!overtime_request_employees_employee_id_fkey!inner(id, department_id, supervisor_id, manager_id, employee_code, full_name)",
    )
    .limit(max);

  const term = safeTerm(f.term);
  if (term) {
    q = q.or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%`, {
      referencedTable: "employees",
    });
  }
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (f.departmentId !== "all") q = q.eq("employees.department_id", f.departmentId);
  if (f.supervisorId !== "all") q = q.eq("employees.supervisor_id", f.supervisorId);
  if (f.managerId !== "all") q = q.eq("employees.manager_id", f.managerId);
  if (f.shift !== "all") q = q.eq("shift_code", f.shift);

  const { data, error } = await q;
  if (error) throw error;
  const list = (data ?? []).map((r: any) => String(r.overtime_request_id));
  return Array.from(new Set<string>(list));
}

function applyRequestFilters<T>(query: T, f: OvertimeFilters): T {
  let q = query as any;
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.from) q = q.gte("work_date", f.from);
  if (f.to) q = q.lte("work_date", f.to);
  return q as T;
}

export async function fetchOvertimeRequests(params: OvertimeListParams) {
  const pageSize = params.pageSize ?? OVERTIME_PAGE_SIZE;
  const fromRow = params.page * pageSize;

  let ids: string[] | null = null;
  if (hasEmployeeFilters(params, params.employeeId)) {
    ids = await matchingRequestIds(params, params.employeeId);
    if (ids.length === 0) return { rows: [] as OvertimeRequestRow[], total: 0 };
  }

  let query: any = supabase
    .from("overtime_requests")
    .select(OVERTIME_SELECT, { count: "exact" })
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(fromRow, fromRow + pageSize - 1);

  if (ids) query = query.in("id", ids);
  query = applyRequestFilters(query, params);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as OvertimeRequestRow[], total: count ?? 0 };
}

/** Ids + statuses of every assignment matching the filters (used by "select all results"). */
export async function fetchFilteredOvertimeIds(params: OvertimeListParams, max = 2000) {
  let ids: string[] | null = null;
  if (hasEmployeeFilters(params, params.employeeId)) {
    ids = await matchingRequestIds(params, params.employeeId);
    if (ids.length === 0) return [] as { id: string; status: RequestStatus }[];
  }
  let query: any = supabase
    .from("overtime_requests")
    .select("id, status")
    .order("work_date", { ascending: false })
    .limit(max);
  if (ids) query = query.in("id", ids);
  query = applyRequestFilters(query, params);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as { id: string; status: RequestStatus }[];
}

const COUNTED_STATUSES: RequestStatus[] = ["pending_manager", "pending_hr", "approved", "rejected"];

export async function fetchOvertimeCounters() {
  const entries = await Promise.all(
    COUNTED_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("overtime_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    }),
  );
  const { count: total, error } = await supabase
    .from("overtime_requests")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  const map = Object.fromEntries(entries) as Record<RequestStatus, number>;
  return { ...map, total: total ?? 0 };
}

/* ------------------------------------------------------------------ *
 * Mutations (workflow decisions happen inside the database)
 * ------------------------------------------------------------------ */

export interface OvertimeItemInput {
  employeeId: string;
  shiftCode: ShiftCode;
}

export interface OvertimeRequestInput {
  workDate: string;
  notes: string;
  items: OvertimeItemInput[];
}

function toJsonItems(items: OvertimeItemInput[]) {
  return items.map((i) => ({ employee_id: i.employeeId, shift_code: i.shiftCode }));
}

export async function submitOvertimeRequest(input: OvertimeRequestInput) {
  const { data, error } = await supabase.rpc("overtime_request_submit", {
    _work_date: input.workDate,
    _items: toJsonItems(input.items),
    _notes: input.notes,
  });
  if (error) throw error;
  return data as string;
}

export async function updateOvertimeRequest(id: string, input: OvertimeRequestInput) {
  const { error } = await supabase.rpc("overtime_request_update", {
    _id: id,
    _work_date: input.workDate,
    _items: toJsonItems(input.items),
    _notes: input.notes,
  });
  if (error) throw error;
}

export async function decideOvertimeRequests(
  ids: string[],
  action: "approve" | "reject" | "cancel",
  reason?: string,
) {
  const args: { _ids: string[]; _action: string; _reason?: string } = { _ids: ids, _action: action };
  if (reason) args._reason = reason;
  const { data, error } = await supabase.rpc("overtime_request_decide", args);
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
  employee_inactive: "أحد الموظفين المحددين غير نشط",
  employees_required: "يجب اختيار موظف واحد على الأقل",
  work_date_required: "يرجى تحديد تاريخ العمل الإضافي",
  shift_required: "يرجى تحديد الوردية لكل موظف",
  shift_invalid: "الوردية المحددة غير صحيحة",
  duplicate_employee: "لا يمكن إضافة الموظف نفسه أكثر من مرة",
  request_not_found: "لم يتم العثور على التكليف",
  request_not_editable: "لا يمكن تعديل التكليف في حالته الحالية",
  rejection_reason_required: "يرجى إدخال سبب الرفض",
  invalid_action: "إجراء غير صحيح",
};

export function overtimeErrorMessage(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? "";
  for (const [key, msg] of Object.entries(DB_ERRORS)) {
    if (raw.includes(key)) return msg;
  }
  if (raw.toLowerCase().includes("duplicate")) return "لا يمكن إضافة الموظف نفسه أكثر من مرة";
  return "تعذّر إتمام العملية، يرجى المحاولة مرة أخرى";
}
