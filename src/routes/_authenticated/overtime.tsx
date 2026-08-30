import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import type { RequestStatus } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/overtime")({
  head: () => ({
    meta: [
      { title: "العمل الإضافي | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "متابعة تكليفات العمل الإضافي وحالات الموافقة عليها." },
      { property: "og:title", content: "العمل الإضافي | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "متابعة تكليفات العمل الإضافي وحالات الموافقة عليها." },
    ],
  }),
  component: OvertimePage,
});

interface OvertimeRow {
  id: string;
  work_date: string;
  notes: string | null;
  status: RequestStatus;
  departments: { name: string } | null;
  overtime_request_employees: { id: string }[];
}

function OvertimePage() {
  const query = useQuery({
    queryKey: ["overtime-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("overtime_requests")
        .select("id, work_date, notes, status, departments(name), overtime_request_employees(id)")
        .order("work_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as OvertimeRow[];
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">تكليفات العمل الإضافي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تُعرض التكليفات المتاحة لك وفق صلاحيتك ونطاقك التنظيمي.
        </p>
      </header>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title="لا توجد تكليفات عمل إضافي حتى الآن"
            description="سيتم تفعيل إنشاء تكليفات العمل الإضافي واختيار الموظفين والورديات في المرحلة التالية."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {query.data.map((row) => (
            <li key={row.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.departments?.name ?? "بدون إدارة"}</p>
                  <p className="text-xs text-muted-foreground">
                    عدد الموظفين: {row.overtime_request_employees?.length ?? 0}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" aria-hidden />
                تاريخ العمل: {row.work_date}
              </p>
              {row.notes ? <p className="mt-2 text-sm">{row.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
