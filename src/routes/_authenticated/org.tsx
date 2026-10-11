import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { employeeErrorMessage } from "@/lib/employees";
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
  email: string | null;
  departments: { name: string } | null;
  manager: { full_name: string; employee_code: string } | null;
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
        .select("id, employee_code, full_name, email, requires_manager_approval, is_active, departments(name), manager:employees!manager_id(full_name, employee_code)")
        .in("profile_id", ids)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as PersonRow[];
    },
  });

  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("employees").update({ requires_manager_approval: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث سير الموافقة");
      qc.invalidateQueries({ queryKey: ["org-people"] });
    },
    onError: (e) => toast.error(employeeErrorMessage(e)),
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
                كود: {p.employee_code} — {p.departments?.name ?? "غير محدد"}
              </p>
            </div>
            <ActiveBadge active={p.is_active} />
          </div>
          {p.email ? <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{p.email}</p> : null}
          {role === "supervisor" ? (
            <>
              <p className="mt-1 text-sm">المدير: {p.manager ? `${p.manager.employee_code} — ${p.manager.full_name}` : "غير محدد"}</p>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">
                  يحتاج اعتماد المدير؟ <b>{p.requires_manager_approval ? "نعم" : "لا"}</b>
                  <span className="block text-xs text-muted-foreground">
                    {p.requires_manager_approval ? "مشرف ← مدير ← موارد بشرية" : "مشرف ← موارد بشرية"}
                  </span>
                </span>
                <Switch
                  checked={p.requires_manager_approval}
                  disabled={toggle.isPending}
                  onCheckedChange={(v) => toggle.mutate({ id: p.id, value: v })}
                  aria-label="يحتاج اعتماد المدير"
                />
              </label>
            </>
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

  return (
    <div className="space-y-3">
      <AddDepartment />
      {query.data.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title="لا توجد إدارات مسجلة"
            description="أضف الإدارات هنا ليمكن اختيارها في بيانات الموظفين وفي ملف الاستيراد."
          />
        </div>
      ) : null}
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
    </div>
  );
}

function AddDepartment() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      const c = code.trim();
      if (!n || !c) throw new Error("required");
      const { error } = await supabase.from("departments").insert({ name: n, code: c });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة الإدارة");
      setName("");
      setCode("");
      qc.invalidateQueries({ queryKey: ["departments-full"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["org-options"] });
    },
    onError: (e) => {
      const m = String((e as { message?: string })?.message ?? "");
      const c = (e as { code?: string })?.code;
      toast.error(
        m === "required"
          ? "اسم الإدارة ورمزها مطلوبان."
          : c === "23505"
            ? "اسم الإدارة أو رمزها مستخدم بالفعل."
            : c === "42501"
              ? "لا تملك صلاحية تنفيذ هذه العملية."
              : "تعذّر حفظ الإدارة، يرجى المحاولة مرة أخرى.",
      );
    },
  });
  return (
    <form
      className="surface-card flex flex-wrap items-end gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <label className="min-w-40 flex-1 text-sm">
        اسم الإدارة
        <Input className="mt-1 h-11" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="w-32 text-sm">
        الرمز
        <Input className="mt-1 h-11" value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <Button type="submit" className="h-11" disabled={add.isPending}>
        {add.isPending ? "جارٍ الحفظ…" : "إضافة إدارة"}
      </Button>
    </form>
  );
}

function OrgPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">المشرفون والمديرون</h1>
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
