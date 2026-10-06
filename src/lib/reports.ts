import { supabase } from "@/integrations/supabase/client";
import { safeTerm } from "@/lib/employees";
import type { RequestStatus } from "@/lib/labels";

export const REPORT_PAGE_SIZE = 50;
const EXPORT_CHUNK = 1000;
const EXPORT_MAX = 50000;

export interface ReportFilters {
  from: string;
  to: string;
  employee: string; // name search
  code: string; // employee code search
  departmentId: string;
  supervisorId: string;
  managerId: string;
  status: string;
  leaveTypeId: string; // leave report only
  shift: string; // overtime report only
  requester: string; // overtime report only (auth user id)
}

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  from: "",
  to: "",
  employee: "",
  code: "",
  departmentId: "all",
  supervisorId: "all",
  managerId: "all",
  status: "all",
  leaveTypeId: "all",
  shift: "all",
  requester: "all",
};

export interface LeaveReportRow {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: RequestStatus;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  leave_type_name: string;
  employee_code: string;
  employee_name: string;
  department_name: string | null;
  supervisor_name: string | null;
  manager_name: string | null;
  submitted_by_name: string | null;
}

export interface OvertimeReportRow {
  id: string;
  request_id: string;
  work_date: string;
  status: RequestStatus;
  shift_code: string;
  cost: number | null;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
  employee_code: string;
  employee_name: string;
  department_name: string | null;
  supervisor_name: string | null;
  manager_name: string | null;
  submitted_by_name: string | null;
}

export type ReportKind = "leave" | "overtime";

function applyFilters(q: any, kind: ReportKind, f: ReportFilters) {
  const name = safeTerm(f.employee);
  const code = safeTerm(f.code);
  if (name) q = q.ilike("employee_name", `%${name}%`);
  if (code) q = q.ilike("employee_code", `%${code}%`);
  if (f.departmentId !== "all") q = q.eq("department_id", f.departmentId);
  if (f.supervisorId !== "all") q = q.eq("supervisor_id", f.supervisorId);
  if (f.managerId !== "all") q = q.eq("manager_id", f.managerId);
  if (f.status !== "all") q = q.eq("status", f.status);
  if (kind === "leave") {
    // overlap with the selected period
    if (f.from) q = q.gte("end_date", f.from);
    if (f.to) q = q.lte("start_date", f.to);
    if (f.leaveTypeId !== "all") q = q.eq("leave_type_id", f.leaveTypeId);
  } else {
    if (f.from) q = q.gte("work_date", f.from);
    if (f.to) q = q.lte("work_date", f.to);
    if (f.shift !== "all") q = q.eq("shift_code", f.shift);
    if (f.requester !== "all") q = q.eq("submitted_by", f.requester);
  }
  return q;
}

function base(kind: ReportKind, count = false) {
  const view = kind === "leave" ? "leave_report" : "overtime_report";
  const order = kind === "leave" ? "start_date" : "work_date";
  return (supabase.from(view as never) as any)
    .select("*", count ? { count: "exact" } : undefined)
    .order(order, { ascending: false })
    .order("employee_code");
}

export async function fetchReportPage<T>(kind: ReportKind, f: ReportFilters, page: number) {
  const q = applyFilters(base(kind, true), kind, f).range(
    page * REPORT_PAGE_SIZE,
    page * REPORT_PAGE_SIZE + REPORT_PAGE_SIZE - 1,
  );
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as T[], total: (count as number | null) ?? 0 };
}

/** All rows matching the active filters, fetched in chunks (for export). */
export async function fetchReportAll<T>(kind: ReportKind, f: ReportFilters): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < EXPORT_MAX; from += EXPORT_CHUNK) {
    const { data, error } = await applyFilters(base(kind), kind, f).range(from, from + EXPORT_CHUNK - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < EXPORT_CHUNK) break;
  }
  return out;
}

export async function logExport(kind: ReportKind, f: ReportFilters, rows: number) {
  await supabase.rpc("log_report_export" as never, {
    _report: kind === "leave" ? "leave_report" : "overtime_report",
    _filters: f,
    _row_count: rows,
  } as never);
}

/** Distinct requesters (profiles) for the overtime requester filter. */
export async function fetchRequesterOptions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name").limit(1000);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || "—" }));
}
