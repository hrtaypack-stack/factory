import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { RequireRole } from "@/components/common/require-role";
import { ActiveBadge } from "@/components/common/status-badge";

export const Route = createFileRoute("/_authenticated/leave-types")({
  head: () => ({
    meta: [
      { title: "أنواع الإجازات | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "إعداد أنواع الإجازات المتاحة والحد السنوي لكل نوع." },
      { property: "og:title", content: "أنواع الإجازات | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "إعداد أنواع الإجازات المتاحة والحد السنوي لكل نوع." },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <LeaveTypesPage />
    </RequireRole>
  ),
});

function LeaveTypesPage() {
  const query = useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_types")
        .select("id, code, name, is_paid, max_days_per_year, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">أنواع الإجازات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الأنواع المعتمدة داخل النظام، وتُستخدم عند تقديم طلبات الإجازة.
        </p>
      </header>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <div className="surface-card">
          <EmptyState title="لا توجد أنواع إجازات" />
        </div>
      ) : (
        <ul className="space-y-3">
          {query.data.map((t) => (
            <li key={t.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">الرمز: {t.code}</p>
                </div>
                <ActiveBadge active={t.is_active} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.is_paid ? "مدفوعة" : "غير مدفوعة"} —{" "}
                {t.max_days_per_year ? `الحد السنوي: ${t.max_days_per_year} يوم` : "بدون حد سنوي"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
