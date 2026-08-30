import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import type { RequestStatus } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/leaves")({
  head: () => ({
    meta: [
      { title: "الإجازات | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "متابعة طلبات الإجازات وحالات الموافقة عليها." },
      { property: "og:title", content: "الإجازات | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "متابعة طلبات الإجازات وحالات الموافقة عليها." },
    ],
  }),
  component: LeavesPage,
});

interface LeaveRow {
  id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: RequestStatus;
  employees: { full_name: string; employee_code: string } | null;
  leave_types: { name: string } | null;
}

function LeavesPage() {
  const query = useQuery({
    queryKey: ["leave-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select(
          "id, start_date, end_date, days_count, status, employees(full_name, employee_code), leave_types(name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as LeaveRow[];
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">طلبات الإجازات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تُعرض الطلبات المتاحة لك وفق صلاحيتك ونطاقك التنظيمي.
        </p>
      </header>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title="لا توجد طلبات إجازة حتى الآن"
            description="سيتم تفعيل تقديم طلبات الإجازة في المرحلة التالية، وستظهر الطلبات هنا مع حالة الموافقة."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {query.data.map((row) => (
            <li key={row.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.employees?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    كود: {row.employees?.employee_code ?? "—"} — {row.leave_types?.name ?? "—"}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden />
                من {row.start_date} إلى {row.end_date} ({row.days_count} يوم)
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
