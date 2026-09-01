import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common/states";
import { OvertimeForm } from "@/components/overtime/overtime-form";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/overtime_/new")({
  head: () => ({
    meta: [
      { title: "تكليف عمل إضافي جديد | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "إنشاء تكليف عمل إضافي لعدة موظفين مع تحديد وردية كل موظف." },
      { property: "og:title", content: "تكليف عمل إضافي جديد | نظام الإجازات والعمل الإضافي" },
      {
        property: "og:description",
        content: "إنشاء تكليف عمل إضافي لعدة موظفين مع تحديد وردية كل موظف.",
      },
    ],
  }),
  component: NewOvertimePage,
});

function NewOvertimePage() {
  const navigate = useNavigate();
  const { data: session, isPending, isError, refetch } = useSession();

  if (isPending) return <LoadingState />;
  if (isError || !session) return <ErrorState onRetry={() => refetch()} />;

  if (!session.employee && !session.roles.includes("hr")) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        حسابك غير مرتبط بملف موظف بعد، لذلك لا يمكن إنشاء تكليفات العمل الإضافي. يرجى التواصل مع
        الموارد البشرية لربط الحساب بكود الموظف الخاص بك.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">تكليف عمل إضافي جديد</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر تاريخ العمل والموظفين، وحدّد وردية كل موظف. يُحدَّد مسار الاعتماد تلقائيًا.
          </p>
        </div>
        <Button variant="outline" size="lg" className="h-11" onClick={() => navigate({ to: "/overtime" })}>
          <ArrowRight className="size-5" aria-hidden />
          رجوع
        </Button>
      </header>

      <div className="surface-card p-4">
        <OvertimeForm
          session={session}
          onDone={() => navigate({ to: "/overtime" })}
          onCancel={() => navigate({ to: "/overtime" })}
        />
      </div>
    </div>
  );
}
