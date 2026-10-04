import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { OvertimeFiltersBar } from "@/components/overtime/overtime-filters";
import { OvertimeDetailDialog } from "@/components/overtime/overtime-detail-dialog";
import { ConfirmDialog, ReasonDialog } from "@/components/leave/decision-dialogs";
import { useSession } from "@/hooks/use-session";
import { STATUS_LABELS } from "@/lib/labels";
import { fetchRequesters, formatDate } from "@/lib/leave";
import {
  EMPTY_OVERTIME_FILTERS,
  OVERTIME_PAGE_SIZE,
  decideOvertimeRequests,
  fetchFilteredOvertimeIds,
  fetchOvertimeCounters,
  fetchOvertimeRequests,
  overtimeErrorMessage,
  shiftLabel,
  type OvertimeFilters,
  type OvertimeRequestRow,
} from "@/lib/overtime";

export const Route = createFileRoute("/_authenticated/overtime")({
  head: () => ({
    meta: [
      { title: "تكليفات العمل الإضافي | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "إنشاء ومتابعة تكليفات العمل الإضافي والورديات مع سير اعتماد كامل." },
      { property: "og:title", content: "تكليفات العمل الإضافي | نظام الإجازات والعمل الإضافي" },
      {
        property: "og:description",
        content: "إنشاء ومتابعة تكليفات العمل الإضافي والورديات مع سير اعتماد كامل.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { status?: string } =>
    typeof s.status === "string" ? { status: s.status } : {},
  component: OvertimePage,
});

function CounterCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`surface-card p-3 text-start transition-colors ${active ? "ring-2 ring-primary" : ""}`}
    >
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </button>
  );
}

function shiftsSummary(row: OvertimeRequestRow): string {
  const counts = new Map<string, number>();
  for (const line of row.overtime_request_employees ?? []) {
    counts.set(line.shift_code, (counts.get(line.shift_code) ?? 0) + 1);
  }
  if (counts.size === 0) return "—";
  return [...counts.entries()].map(([code, n]) => `${shiftLabel(code)} (${n})`).join(" — ");
}

function OvertimePage() {
  const { data: session, isPending: sessionPending, isError: sessionError, refetch } = useSession();
  const queryClient = useQueryClient();
  const { status: initialStatus } = Route.useSearch();

  const [filters, setFilters] = useState<OvertimeFilters>(() => ({ ...EMPTY_OVERTIME_FILTERS, status: initialStatus ?? "all" }));
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<OvertimeRequestRow | null>(null);
  const [bulkApprove, setBulkApprove] = useState(false);
  const [bulkReject, setBulkReject] = useState(false);

  const isHr = !!session?.roles.includes("hr");

  const counters = useQuery({
    queryKey: ["overtime-counters"],
    queryFn: fetchOvertimeCounters,
    enabled: !!session,
  });

  const listParams = { ...filters, page };
  const list = useQuery({
    queryKey: ["overtime-requests", listParams],
    queryFn: () => fetchOvertimeRequests(listParams),
    enabled: !!session,
  });

  const requesters = useQuery({
    queryKey: ["overtime-requesters", (list.data?.rows ?? []).map((r) => r.submitted_by).join(",")],
    queryFn: () => fetchRequesters((list.data?.rows ?? []).map((r) => r.submitted_by)),
    enabled: (list.data?.rows.length ?? 0) > 0,
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / OVERTIME_PAGE_SIZE));
  const eligibleOnPage = useMemo(() => rows.filter((r) => r.status === "pending_hr"), [rows]);
  const allPageSelected =
    eligibleOnPage.length > 0 && eligibleOnPage.every((r) => selected.includes(r.id));

  const bulk = useMutation({
    mutationFn: (args: { action: "approve" | "reject"; reason?: string }) =>
      decideOvertimeRequests(selected, args.action, args.reason),
    onSuccess: (count, args) => {
      toast.success(args.action === "approve" ? `تم اعتماد ${count} تكليف` : `تم رفض ${count} تكليف`);
      setSelected([]);
      setBulkApprove(false);
      setBulkReject(false);
      queryClient.invalidateQueries({ queryKey: ["overtime-requests"] });
      queryClient.invalidateQueries({ queryKey: ["overtime-counters"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e) => toast.error(overtimeErrorMessage(e)),
  });

  const selectAllFiltered = useMutation({
    mutationFn: () => fetchFilteredOvertimeIds(listParams),
    onSuccess: (all) => {
      const ids = all.filter((r) => r.status === "pending_hr").map((r) => r.id);
      setSelected(ids);
      toast.success(`تم تحديد ${ids.length} تكليف جاهز لاعتماد الإدارة`);
    },
    onError: (e) => toast.error(overtimeErrorMessage(e)),
  });

  if (sessionPending) return <LoadingState />;
  if (sessionError || !session) return <ErrorState onRetry={() => refetch()} />;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function setFiltersReset(next: OvertimeFilters) {
    setFilters(next);
    setPage(0);
    setSelected([]);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">تكليفات العمل الإضافي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isHr
              ? "معالجة سريعة للتكليفات مع بحث وتصفية واعتماد جماعي."
              : "التكليفات المتاحة لك وفق صلاحيتك ونطاقك التنظيمي."}
          </p>
        </div>
        <Button asChild size="lg" className="h-12">
          <Link to="/overtime/new">
            <Plus className="size-5" aria-hidden />
            تكليف عمل إضافي جديد
          </Link>
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counters.isPending || counters.isError ? null : (
          <>
            <CounterCard
              label="بانتظار المدير"
              value={counters.data.pending_manager}
              active={filters.status === "pending_manager"}
              onClick={() => setFiltersReset({ ...filters, status: "pending_manager" })}
            />
            <CounterCard
              label="بانتظار الإدارة"
              value={counters.data.pending_hr}
              active={filters.status === "pending_hr"}
              onClick={() => setFiltersReset({ ...filters, status: "pending_hr" })}
            />
            <CounterCard
              label="معتمدة"
              value={counters.data.approved}
              active={filters.status === "approved"}
              onClick={() => setFiltersReset({ ...filters, status: "approved" })}
            />
            <CounterCard
              label="مرفوضة"
              value={counters.data.rejected}
              active={filters.status === "rejected"}
              onClick={() => setFiltersReset({ ...filters, status: "rejected" })}
            />
          </>
        )}
      </section>

      <OvertimeFiltersBar value={filters} onChange={setFiltersReset} showOrgFilters={isHr} />

      {isHr && selected.length > 0 ? (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-sm font-semibold">تم تحديد {selected.length} تكليف</span>
          <Button size="lg" className="h-11" onClick={() => setBulkApprove(true)}>
            الموافقة على المحدد
          </Button>
          <Button size="lg" variant="destructive" className="h-11" onClick={() => setBulkReject(true)}>
            رفض المحدد
          </Button>
          <Button size="lg" variant="ghost" className="h-11" onClick={() => setSelected([])}>
            إلغاء التحديد
          </Button>
        </div>
      ) : null}

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title="لا توجد تكليفات عمل إضافي مطابقة للبحث."
            description="يمكنك تعديل عوامل التصفية أو إنشاء تكليف عمل إضافي جديد."
          />
        </div>
      ) : (
        <>
          {/* Mobile / tablet cards */}
          <ul className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="surface-card p-4">
                <button type="button" className="w-full text-start" onClick={() => setDetail(row)}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{formatDate(row.work_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.departments?.name ?? "بدون إدارة"}
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="size-4" aria-hidden />
                    عدد الموظفين: {row.overtime_request_employees?.length ?? 0}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" aria-hidden />
                    {shiftsSummary(row)}
                  </p>
                  {row.notes ? <p className="mt-2 text-sm">{row.notes}</p> : null}
                </button>
                {isHr && row.status === "pending_hr" ? (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(row.id)}
                      onCheckedChange={() => toggle(row.id)}
                      aria-label="تحديد التكليف"
                    />
                    تحديد للاعتماد الجماعي
                  </label>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Desktop dense table */}
          <div className="surface-card hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-start">
                <tr>
                  {isHr ? (
                    <th className="w-10 p-3">
                      <Checkbox
                        checked={allPageSelected}
                        disabled={eligibleOnPage.length === 0}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked
                              ? [...new Set([...prev, ...eligibleOnPage.map((r) => r.id)])]
                              : prev.filter((id) => !eligibleOnPage.some((r) => r.id === id)),
                          )
                        }
                        aria-label="تحديد الكل"
                      />
                    </th>
                  ) : null}
                  <th className="p-3 text-start font-semibold">تاريخ العمل</th>
                  <th className="p-3 text-start font-semibold">الإدارة</th>
                  <th className="p-3 text-start font-semibold">عدد الموظفين</th>
                  <th className="p-3 text-start font-semibold">الورديات</th>
                  <th className="p-3 text-start font-semibold">مقدّم التكليف</th>
                  <th className="p-3 text-start font-semibold">الحالة</th>
                  <th className="p-3 text-start font-semibold">تاريخ التقديم</th>
                  <th className="p-3 text-start font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {isHr ? (
                      <td className="p-3">
                        <Checkbox
                          checked={selected.includes(row.id)}
                          disabled={row.status !== "pending_hr"}
                          onCheckedChange={() => toggle(row.id)}
                          aria-label="تحديد التكليف"
                        />
                      </td>
                    ) : null}
                    <td className="p-3 whitespace-nowrap">{formatDate(row.work_date)}</td>
                    <td className="p-3">{row.departments?.name ?? "—"}</td>
                    <td className="p-3 tabular-nums">{row.overtime_request_employees?.length ?? 0}</td>
                    <td className="max-w-72 p-3">
                      <span className="block truncate">{shiftsSummary(row)}</span>
                    </td>
                    <td className="max-w-40 p-3">
                      <span className="block truncate">
                        {row.submitted_by === session.userId
                          ? "أنت"
                          : (requesters.data?.[row.submitted_by] ?? "—")}
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="p-3">
                      <Button variant="outline" size="sm" onClick={() => setDetail(row)}>
                        عرض
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              إجمالي النتائج: {total} — صفحة {page + 1} من {pageCount}
            </p>
            <div className="flex items-center gap-2">
              {isHr ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11"
                  disabled={selectAllFiltered.isPending}
                  onClick={() => selectAllFiltered.mutate()}
                >
                  تحديد الكل ({STATUS_LABELS.pending_hr})
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="الصفحة السابقة"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronRight className="size-5" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="الصفحة التالية"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}

      <OvertimeDetailDialog
        request={detail}
        session={session}
        requesterName={detail ? requesters.data?.[detail.submitted_by] : undefined}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />

      <ConfirmDialog
        open={bulkApprove}
        onOpenChange={setBulkApprove}
        title="هل أنت متأكد من اعتماد التكليفات المحددة؟"
        description={`سيتم اعتماد ${selected.length} تكليف من التكليفات الجاهزة لاعتماد الإدارة فقط.`}
        confirmLabel="اعتماد"
        pending={bulk.isPending}
        onConfirm={() => bulk.mutate({ action: "approve" })}
      />
      <ReasonDialog
        open={bulkReject}
        onOpenChange={setBulkReject}
        title={`رفض ${selected.length} تكليف`}
        description="يرجى إدخال سبب الرفض."
        pending={bulk.isPending}
        onConfirm={(reason) => bulk.mutate({ action: "reject", reason })}
      />
    </div>
  );
}
