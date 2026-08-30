import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/hooks/use-session";
import { LoadingState, ErrorState } from "@/components/common/states";
import { ROLE_LABELS } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "بيانات الحساب والصلاحيات وربط الحساب بملف الموظف." },
      { property: "og:title", content: "الإعدادات | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "بيانات الحساب والصلاحيات وربط الحساب بملف الموظف." },
    ],
  }),
  component: SettingsPage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function SettingsPage() {
  const { data: session, isPending, isError, refetch } = useSession();

  if (isPending) return <LoadingState />;
  if (isError || !session) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">بيانات حسابك وصلاحياتك الحالية.</p>
      </header>

      <div className="surface-card p-4">
        <Row label="الاسم" value={session.fullName} />
        <Row label="البريد الإلكتروني" value={session.email ?? "—"} />
        <Row label="الصلاحيات" value={session.roles.map((r) => ROLE_LABELS[r]).join("، ") || "—"} />
        <Row label="كود الموظف" value={session.employee?.employee_code ?? "غير مرتبط"} />
        <Row label="المسمى الوظيفي" value={session.employee?.job_title ?? "—"} />
        <Row
          label="سير الموافقة"
          value={
            session.employee
              ? session.employee.requires_manager_approval
                ? "يتطلب موافقة المدير ثم الموارد البشرية"
                : "يذهب مباشرة إلى الموارد البشرية"
              : "—"
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        تعديل الصلاحيات وربط الحسابات بملفات الموظفين يتم من قِبل الموارد البشرية فقط.
      </p>
    </div>
  );
}
