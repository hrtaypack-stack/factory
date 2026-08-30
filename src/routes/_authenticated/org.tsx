import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { RequireRole } from "@/components/common/require-role";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActiveBadge } from "@/components/common/status-badge";

export const Route = createFileRoute("/_authenticated/org")({
  head: () => ({
    meta: [
      { title: "الهيكل التنظيمي | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "الإدارات والمديرون والمشرفون وعلاقات الإشراف داخل المصنع." },
      { property: "og:title", content: "الهيكل التنظيمي | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "الإدارات والمديرون والمشرفون وعلاقات الإشراف داخل المصنع." },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <OrgPage />
    </RequireRole>
  ),
});

interface PersonRow {
  id: string;
  employee_code: string;
  full_name: string;
  requires_manager_approval: boolean;
  is_active: boolean;
  departments: { name: string } | null;
}

function PeopleList({ role }: { role: "manager" | "supervisor" }) {
  const query = useQuery({
    queryKey: ["org-people", role],
    queryFn: async () => {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role);
      if (roleError) throw roleError;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as PersonRow[];
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_code, full_name, requires_manager_approval, is_active, departments(name)")
        .in("profile_id", ids)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as PersonRow[];
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  if (query.data.length === 0)
    return (
      <div className="surface-card">
        <EmptyState
          title={role === "manager" ? "لا يوجد مديرون معرّفون" : "لا يوجد مشرفون معرّفون"}
          description="يتم تعريف المديرين والمشرفين عن طريق منح الصلاحية للحساب وربطه بملف الموظف."
        />
      </div>
    );

  return (
    <ul className="space-y-3">
      {query.data.map((p) => (
        <li key={p.id} className="surface-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.full_name}</p>
              <p className="text-xs text-muted-foreground">
                كود: {p.employee_code} — {p.departments?.name ?? "بدون إدارة"}
              </p>
            </div>
            <ActiveBadge active={p.is_active} />
          </div>
          {role === "supervisor" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              سير الموافقة: {p.requires_manager_approval ? "مشرف ← مدير ← موارد بشرية" : "مشرف ← موارد بشرية"}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DepartmentsList() {
  const query = useQuery({
    queryKey: ["departments-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, code, name, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  if (query.data.length === 0)
    return (
      <div className="surface-card">
        <EmptyState
          title="لا توجد إدارات مسجلة"
          description="ستتم إضافة إدارات المصنع مع استيراد بيانات الموظفين في المرحلة التالية."
        />
      </div>
    );

  return (
    <ul className="space-y-3">
      {query.data.map((d) => (
        <li key={d.id} className="surface-card flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{d.name}</p>
            <p className="text-xs text-muted-foreground">الرمز: {d.code}</p>
          </div>
          <ActiveBadge active={d.is_active} />
        </li>
      ))}
    </ul>
  );
}

function OrgPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">الهيكل التنظيمي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الإدارات والمديرون والمشرفون، وسير الموافقة الخاص بكل مشرف.
        </p>
      </header>

      <Tabs defaultValue="departments">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="departments" className="py-2.5">
            الإدارات
          </TabsTrigger>
          <TabsTrigger value="managers" className="py-2.5">
            المديرون
          </TabsTrigger>
          <TabsTrigger value="supervisors" className="py-2.5">
            المشرفون
          </TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-4">
          <DepartmentsList />
        </TabsContent>
        <TabsContent value="managers" className="mt-4">
          <PeopleList role="manager" />
        </TabsContent>
        <TabsContent value="supervisors" className="mt-4">
          <PeopleList role="supervisor" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
