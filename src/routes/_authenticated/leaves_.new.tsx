import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common/states";
import { LeaveForm } from "@/components/leave/leave-form";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/leaves_/new")({
  head: () => ({
    meta: [
      { title: "طلب إجازة جديدة | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "تقديم طلب إجازة جديد مع حساب عدد الأيام تلقائيًا." },
      { property: "og:title", content: "طلب إجازة جديدة | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "تقديم طلب إجازة جديد مع حساب عدد الأيام تلقائيًا." },
    ],
  }),
  component: NewLeavePage,
});

function NewLeavePage() {
  const navigate = useNavigate();
  const { data: session, isPending, isError, refetch } = useSession();

  if (isPending) return <LoadingState />;
  if (isError || !session) return <ErrorState onRetry={() => refetch()} />;

  if (!session.employee && !session.roles.includes("hr")) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        حسابك غير مرتبط بملف موظف بعد، لذلك لا يمكن تقديم طلبات الإجازة. يرجى التواصل مع الموارد
        البشرية لربط الحساب بكود الموظف الخاص بك.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">طلب إجازة جديدة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            يتم حساب عدد الأيام تلقائيًا، ويُحدَّد مسار الاعتماد وفق إعدادات الموظف.
          </p>
        </div>
        <Button variant="outline" size="lg" className="h-11" onClick={() => navigate({ to: "/leaves" })}>
          <ArrowRight className="size-5" aria-hidden />
          رجوع
        </Button>
      </header>

      <div className="surface-card p-4">
        <LeaveForm
          session={session}
          onDone={() => navigate({ to: "/leaves" })}
          onCancel={() => navigate({ to: "/leaves" })}
        />
      </div>
    </div>
  );
}
