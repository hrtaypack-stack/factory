import { createFileRoute } from "@tanstack/react-router";
import { createFileRoute as _unused } from "@tanstack/react-router";
import { RequireRole } from "@/components/common/require-role";
import { EmptyState } from "@/components/common/states";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "تقارير الإجازات وتكاليف العمل الإضافي عبر فترات زمنية." },
      { property: "og:title", content: "التقارير | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "تقارير الإجازات وتكاليف العمل الإضافي عبر فترات زمنية." },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <ReportsPage />
    </RequireRole>
  ),
});

function ReportsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">التقارير</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تقارير الإجازات وتكاليف العمل الإضافي عبر فترات زمنية وسنوات متعددة.
        </p>
      </header>
      <div className="surface-card">
        <EmptyState
          title="التقارير غير متاحة بعد"
          description="سيتم بناء تقارير الإجازات وتكاليف العمل الإضافي بعد تفعيل وحدتي الإجازات والعمل الإضافي، وستُحسب من بيانات فعلية دون أرقام تقديرية."
        />
      </div>
    </div>
  );
}
