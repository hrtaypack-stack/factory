import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, UserCheck, UserX, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { LoadingState, ErrorState } from "@/components/common/states";
import { ROLE_LABELS } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "الرئيسية | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "لوحة متابعة الإجازات والعمل الإضافي حسب صلاحية المستخدم." },
      { property: "og:title", content: "الرئيسية | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "لوحة متابعة الإجازات والعمل الإضافي حسب صلاحية المستخدم." },
    ],
  }),
  component: DashboardPage,
});

async function count(table: "employees" | "leave_requests" | "overtime_requests", apply?: (q: any) => any) {
  let query: any = supabase.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count: c, error } = await query;
  if (error) throw error;
  return c ?? 0;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
}) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/12 text-destructive",
    info: "bg-info/15 text-info",
  };
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { data: session, isPending: sessionPending } = useSession();

  const stats = useQuery({
    queryKey: ["dashboard-stats", session?.role],
    enabled: !!session,
    queryFn: async () => ({
      employeesTotal: await count("employees"),
      employeesActive: await count("employees", (q) => q.eq("is_active", true)),
      employeesInactive: await count("employees", (q) => q.eq("is_active", false)),
      pendingManager: await count("leave_requests", (q) => q.eq("status", "pending_manager")),
      pendingHr: await count("leave_requests", (q) => q.eq("status", "pending_hr")),
      leaveApproved: await count("leave_requests", (q) => q.eq("status", "approved")),
      leaveRejected: await count("leave_requests", (q) => q.eq("status", "rejected")),
      overtimeTotal: await count("overtime_requests"),
    }),
  });

  if (sessionPending) return <LoadingState />;

  const role = session?.role ?? "employee";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">مرحبًا، {session?.fullName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الصلاحية الحالية: {ROLE_LABELS[role]}
          {session?.employee ? ` — كود الموظف: ${session.employee.employee_code}` : ""}
        </p>
      </header>

      {!session?.employee ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          حسابك غير مرتبط بملف موظف بعد. يرجى التواصل مع الموارد البشرية لربط الحساب بكود الموظف
          الخاص بك حتى تتمكن من تقديم الطلبات.
        </div>
      ) : null}

      {stats.isPending ? (
        <LoadingState />
      ) : stats.isError ? (
        <ErrorState
          description="تعذّر حساب الإحصائيات من قاعدة البيانات."
          onRetry={() => stats.refetch()}
        />
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(role === "hr" || role === "manager" || role === "supervisor") && (
            <>
              <StatCard label="إجمالي الموظفين" value={stats.data.employeesTotal} icon={Users} />
              <StatCard
                label="الموظفون النشطون"
                value={stats.data.employeesActive}
                icon={UserCheck}
                tone="success"
              />
              <StatCard
                label="الموظفون غير النشطين"
                value={stats.data.employeesInactive}
                icon={UserX}
                tone="destructive"
              />
            </>
          )}
          <StatCard
            label="بانتظار موافقة المدير"
            value={stats.data.pendingManager}
            icon={Clock}
            tone="warning"
          />
          <StatCard
            label="بانتظار موافقة الموارد البشرية"
            value={stats.data.pendingHr}
            icon={Clock}
            tone="info"
          />
          <StatCard
            label="إجازات معتمدة"
            value={stats.data.leaveApproved}
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            label="إجازات مرفوضة"
            value={stats.data.leaveRejected}
            icon={XCircle}
            tone="destructive"
          />
          <StatCard
            label="تكليفات العمل الإضافي"
            value={stats.data.overtimeTotal}
            icon={CalendarDays}
          />
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        الأرقام محسوبة من قاعدة البيانات وفق صلاحيتك، وتتوسّع تلقائيًا عند إضافة طلبات الإجازات
        والعمل الإضافي.
      </p>
    </div>
  );
}
