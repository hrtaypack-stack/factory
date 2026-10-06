import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RequireRole } from "@/components/common/require-role";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_LABELS } from "@/lib/labels";
import { SHIFT_CODES, SHIFT_LABELS, shiftLabel } from "@/lib/overtime";
import { fetchPeopleWithRole } from "@/lib/employees";
import { exportToExcel, excelDate } from "@/lib/excel";
import {
  EMPTY_REPORT_FILTERS,
  REPORT_PAGE_SIZE,
  fetchReportAll,
  fetchReportPage,
  fetchRequesterOptions,
  logExport,
  type LeaveReportRow,
  type OvertimeReportRow,
  type ReportFilters,
  type ReportKind,
} from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "تقرير الإجازات وتقرير تكاليف العمل الإضافي مع تصفية وتصدير إلى Excel." },
      { property: "og:title", content: "التقارير | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "تقرير الإجازات وتقرير تكاليف العمل الإضافي مع تصفية وتصدير إلى Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <ReportsPage />
    </RequireRole>
  ),
});

const fmt = (d: string | null) => (d ? d.slice(0, 10) : "—");

function ReportsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">التقارير</h1>
        <p className="mt-1 text-sm text-muted-foreground">جميع الفلاتر قابلة للدمج، والتصدير يشمل النتائج المصفّاة فقط.</p>
      </header>
      <Tabs defaultValue="leave">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="leave" className="py-2.5">تقرير الإجازات</TabsTrigger>
          <TabsTrigger value="overtime" className="py-2.5">تقرير تكاليف العمل الإضافي</TabsTrigger>
        </TabsList>
        <TabsContent value="leave" className="mt-4"><Report kind="leave" /></TabsContent>
        <TabsContent value="overtime" className="mt-4"><Report kind="overtime" /></TabsContent>
      </Tabs>
    </div>
  );
}

function Report({ kind }: { kind: ReportKind }) {
  const [draft, setDraft] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  // text inputs are debounced; selects apply immediately
  useEffect(() => {
    const t = setTimeout(() => { setFilters(draft); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [draft]);

  const set = (p: Partial<ReportFilters>) => setDraft((d) => ({ ...d, ...p }));

  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const supervisors = useQuery({ queryKey: ["people-role", "supervisor"], queryFn: () => fetchPeopleWithRole("supervisor") });
  const managers = useQuery({ queryKey: ["people-role", "manager"], queryFn: () => fetchPeopleWithRole("manager") });
  const leaveTypes = useQuery({
    queryKey: ["leave-types-all"],
    enabled: kind === "leave",
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_types").select("id, name, is_active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const requesters = useQuery({ queryKey: ["requesters"], enabled: kind === "overtime", queryFn: fetchRequesterOptions });

  const result = useQuery({
    queryKey: ["report", kind, filters, page],
    queryFn: () => fetchReportPage<LeaveReportRow & OvertimeReportRow>(kind, filters, page),
    placeholderData: (p) => p,
  });

  const total = result.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));

  const doExport = async () => {
    setExporting(true);
    try {
      if (kind === "leave") {
        const rows = await fetchReportAll<LeaveReportRow>("leave", filters);
        await exportToExcel("تقرير_الإجازات", "تقرير الإجازات", [
          { label: "كود الموظف", value: (r) => r.employee_code, width: 14 },
          { label: "اسم الموظف", value: (r) => r.employee_name, width: 26 },
          { label: "القسم", value: (r) => r.department_name },
          { label: "المشرف", value: (r) => r.supervisor_name },
          { label: "المدير", value: (r) => r.manager_name },
          { label: "نوع الإجازة", value: (r) => r.leave_type_name },
          { label: "من تاريخ", value: (r) => excelDate(r.start_date), width: 12 },
          { label: "إلى تاريخ", value: (r) => excelDate(r.end_date), width: 12 },
          { label: "عدد الأيام", value: (r) => r.days_count, width: 10 },
          { label: "الحالة", value: (r) => STATUS_LABELS[r.status] },
          { label: "مقدم الطلب", value: (r) => r.submitted_by_name },
          { label: "تاريخ التقديم", value: (r) => excelDate(r.created_at), width: 12 },
          { label: "تاريخ الاعتماد", value: (r) => excelDate(r.approved_at), width: 12 },
          { label: "سبب الرفض", value: (r) => r.rejection_reason, width: 30 },
        ], rows);
        await logExport("leave", filters, rows.length);
        toast.success(`تم تصدير ${rows.length} سجل`);
      } else {
        const rows = await fetchReportAll<OvertimeReportRow>("overtime", filters);
        await exportToExcel("تقرير_العمل_الإضافي", "العمل الإضافي", [
          { label: "التاريخ", value: (r) => excelDate(r.work_date), width: 12 },
          { label: "كود الموظف", value: (r) => r.employee_code, width: 14 },
          { label: "اسم الموظف", value: (r) => r.employee_name, width: 26 },
          { label: "القسم", value: (r) => r.department_name },
          { label: "المشرف", value: (r) => r.supervisor_name },
          { label: "المدير", value: (r) => r.manager_name },
          { label: "الوردية", value: (r) => shiftLabel(r.shift_code) },
          { label: "مقدم الطلب", value: (r) => r.submitted_by_name },
          { label: "الحالة", value: (r) => STATUS_LABELS[r.status] },
          { label: "تاريخ الاعتماد", value: (r) => excelDate(r.approved_at), width: 12 },
          { label: "التكلفة", value: (r) => r.cost ?? "غير محددة", width: 12 },
          { label: "سبب الرفض", value: (r) => r.rejection_reason, width: 30 },
        ], rows);
        await logExport("overtime", filters, rows.length);
        toast.success(`تم تصدير ${rows.length} سجل`);
      }
    } catch {
      toast.error("تعذّر تصدير التقرير، يرجى المحاولة مرة أخرى.");
    } finally {
      setExporting(false);
    }
  };

  const sel = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    allLabel: string,
    items: { id: string; name: string }[],
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const people = (l: { id: string; employee_code: string; full_name: string }[] | undefined) =>
    (l ?? []).map((p) => ({ id: p.id, name: `${p.employee_code} — ${p.full_name}` }));

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" className="h-11" value={draft.from} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" className="h-11" value={draft.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الموظف</Label>
            <Input className="h-11" placeholder="اسم الموظف" value={draft.employee} onChange={(e) => set({ employee: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">كود الموظف</Label>
            <Input className="h-11 tabular-nums" placeholder="الكود" value={draft.code} onChange={(e) => set({ code: e.target.value })} />
          </div>
          {sel("القسم", draft.departmentId, (v) => set({ departmentId: v }), "جميع الأقسام", departments.data ?? [])}
          {sel("المشرف", draft.supervisorId, (v) => set({ supervisorId: v }), "جميع المشرفين", people(supervisors.data))}
          {sel("المدير", draft.managerId, (v) => set({ managerId: v }), "جميع المديرين", people(managers.data))}
          {kind === "leave"
            ? sel("نوع الإجازة", draft.leaveTypeId, (v) => set({ leaveTypeId: v }), "جميع الأنواع",
                (leaveTypes.data ?? []).map((t) => ({ id: t.id, name: t.is_active ? t.name : `${t.name} (غير نشط)` })))
            : sel("الوردية", draft.shift, (v) => set({ shift: v }), "جميع الورديات",
                SHIFT_CODES.map((c) => ({ id: c, name: SHIFT_LABELS[c] })))}
          {sel("الحالة", draft.status, (v) => set({ status: v }), "جميع الحالات",
            Object.entries(STATUS_LABELS).map(([id, name]) => ({ id, name })))}
          {kind === "overtime"
            ? sel("مقدم الطلب", draft.requester, (v) => set({ requester: v }), "جميع مقدمي الطلبات", requesters.data ?? [])
            : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">عدد السجلات: <b className="tabular-nums">{total}</b></span>
          <div className="flex gap-2">
            <Button variant="ghost" className="h-11" onClick={() => setDraft(EMPTY_REPORT_FILTERS)}>مسح الفلاتر</Button>
            <Button className="h-11" onClick={doExport} disabled={exporting || total === 0}>
              <Download className="size-4" /> {exporting ? "جارٍ التصدير…" : "تصدير إلى Excel"}
            </Button>
          </div>
        </div>
        {kind === "overtime" ? (
          <p className="rounded-lg bg-info/10 p-2.5 text-xs">
            التكلفة تظهر "غير محددة" إلى أن يتم اعتماد قواعد احتساب العمل الإضافي الرسمية؛ لا يعرض النظام أي تكلفة تقديرية.
          </p>
        ) : null}
      </div>

      {result.isPending ? (
        <LoadingState />
      ) : result.isError ? (
        <ErrorState onRetry={() => result.refetch()} />
      ) : (result.data?.rows.length ?? 0) === 0 ? (
        <div className="surface-card"><EmptyState title="لا توجد سجلات" description="لا توجد نتائج مطابقة للفلاتر الحالية." /></div>
      ) : kind === "leave" ? (
        <LeaveTable rows={result.data!.rows} />
      ) : (
        <OvertimeTable rows={result.data!.rows} />
      )}

      {total > REPORT_PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" className="size-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="الصفحة السابقة">
            <ChevronRight className="size-5" />
          </Button>
          <span className="text-sm tabular-nums">صفحة {page + 1} من {pages}</span>
          <Button variant="outline" size="icon" className="size-11" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="الصفحة التالية">
            <ChevronLeft className="size-5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const th = "px-2.5 py-2.5 font-semibold whitespace-nowrap";
const td = "px-2.5 py-2";

function LeaveTable({ rows }: { rows: LeaveReportRow[] }) {
  return (
    <>
      <ul className="space-y-3 xl:hidden">
        {rows.map((r) => (
          <li key={r.id} className="surface-card space-y-1 p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold tabular-nums text-primary">{r.employee_code}</p>
                <p className="truncate font-semibold">{r.employee_name}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p>{r.leave_type_name} — {fmt(r.start_date)} ← {fmt(r.end_date)} ({r.days_count} يوم)</p>
            <p className="text-muted-foreground">{r.department_name ?? "—"} · المشرف: {r.supervisor_name ?? "—"} · المدير: {r.manager_name ?? "—"}</p>
            <p className="text-muted-foreground">مقدم الطلب: {r.submitted_by_name ?? "—"} · التقديم: {fmt(r.created_at)}{r.approved_at ? ` · الاعتماد: ${fmt(r.approved_at)}` : ""}</p>
            {r.rejection_reason ? <p className="text-destructive">سبب الرفض: {r.rejection_reason}</p> : null}
          </li>
        ))}
      </ul>
      <div className="surface-card hidden overflow-hidden xl:block">
        <table className="w-full text-right text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className={th}>الكود</th><th className={th}>الموظف</th><th className={th}>القسم</th>
              <th className={th}>المشرف</th><th className={th}>المدير</th><th className={th}>النوع</th>
              <th className={th}>من</th><th className={th}>إلى</th><th className={th}>الأيام</th>
              <th className={th}>الحالة</th><th className={th}>مقدم الطلب</th><th className={th}>التقديم</th>
              <th className={th}>الاعتماد</th><th className={th}>سبب الرفض</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className={`${td} font-bold tabular-nums text-primary`}>{r.employee_code}</td>
                <td className={td}>{r.employee_name}</td>
                <td className={td}>{r.department_name ?? "—"}</td>
                <td className={td}>{r.supervisor_name ?? "—"}</td>
                <td className={td}>{r.manager_name ?? "—"}</td>
                <td className={td}>{r.leave_type_name}</td>
                <td className={`${td} tabular-nums`}>{fmt(r.start_date)}</td>
                <td className={`${td} tabular-nums`}>{fmt(r.end_date)}</td>
                <td className={`${td} tabular-nums`}>{r.days_count}</td>
                <td className={td}><StatusBadge status={r.status} /></td>
                <td className={td}>{r.submitted_by_name ?? "—"}</td>
                <td className={`${td} tabular-nums`}>{fmt(r.created_at)}</td>
                <td className={`${td} tabular-nums`}>{fmt(r.approved_at)}</td>
                <td className={`${td} max-w-40 truncate`} title={r.rejection_reason ?? ""}>{r.rejection_reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OvertimeTable({ rows }: { rows: OvertimeReportRow[] }) {
  return (
    <>
      <ul className="space-y-3 xl:hidden">
        {rows.map((r) => (
          <li key={r.id} className="surface-card space-y-1 p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold tabular-nums text-primary">{r.employee_code}</p>
                <p className="truncate font-semibold">{r.employee_name}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p>{fmt(r.work_date)} — {shiftLabel(r.shift_code)}</p>
            <p className="text-muted-foreground">{r.department_name ?? "—"} · المشرف: {r.supervisor_name ?? "—"} · المدير: {r.manager_name ?? "—"}</p>
            <p className="text-muted-foreground">مقدم الطلب: {r.submitted_by_name ?? "—"}{r.approved_at ? ` · الاعتماد: ${fmt(r.approved_at)}` : ""}</p>
            <p>التكلفة: {r.cost ?? "غير محددة"}</p>
          </li>
        ))}
      </ul>
      <div className="surface-card hidden overflow-hidden xl:block">
        <table className="w-full text-right text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className={th}>التاريخ</th><th className={th}>الكود</th><th className={th}>الموظف</th>
              <th className={th}>القسم</th><th className={th}>المشرف</th><th className={th}>المدير</th>
              <th className={th}>الوردية</th><th className={th}>مقدم الطلب</th><th className={th}>الحالة</th>
              <th className={th}>الاعتماد</th><th className={th}>التكلفة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className={`${td} tabular-nums`}>{fmt(r.work_date)}</td>
                <td className={`${td} font-bold tabular-nums text-primary`}>{r.employee_code}</td>
                <td className={td}>{r.employee_name}</td>
                <td className={td}>{r.department_name ?? "—"}</td>
                <td className={td}>{r.supervisor_name ?? "—"}</td>
                <td className={td}>{r.manager_name ?? "—"}</td>
                <td className={td}>{shiftLabel(r.shift_code)}</td>
                <td className={td}>{r.submitted_by_name ?? "—"}</td>
                <td className={td}><StatusBadge status={r.status} /></td>
                <td className={`${td} tabular-nums`}>{fmt(r.approved_at)}</td>
                <td className={`${td} text-muted-foreground`}>{r.cost ?? "غير محددة"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
