import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ActiveBadge } from "@/components/common/status-badge";
import { RequireRole } from "@/components/common/require-role";
import { useSession } from "@/hooks/use-session";
import { ROLE_LABELS, type AppRole } from "@/lib/labels";
import {
  EMPLOYEE_PAGE_SIZE,
  EMPTY_EMPLOYEE_FILTERS,
  employeeErrorMessage,
  fetchEmployeesAdmin,
  fetchPeopleWithRole,
  type EmployeeAdminRow,
  type EmployeeFilters,
  type PersonRef,
} from "@/lib/employees";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "الموظفون | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "إدارة بيانات الموظفين: البحث بكود الموظف، التصفية، والتعديل." },
      { property: "og:title", content: "الموظفون | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "إدارة بيانات الموظفين: البحث بكود الموظف، التصفية، والتعديل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr", "manager", "supervisor"]}>
      <EmployeesPage />
    </RequireRole>
  ),
});

const NONE = "none";

function PersonSelect({
  value,
  onChange,
  people,
  allLabel,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  people: PersonRef[];
  allLabel: string;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11" aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.employee_code} — {p.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useOrgOptions() {
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const supervisors = useQuery({ queryKey: ["people-role", "supervisor"], queryFn: () => fetchPeopleWithRole("supervisor") });
  const managers = useQuery({ queryKey: ["people-role", "manager"], queryFn: () => fetchPeopleWithRole("manager") });
  return {
    departments: departments.data ?? [],
    supervisors: supervisors.data ?? [],
    managers: managers.data ?? [],
  };
}

function EmployeesPage() {
  const { data: session } = useSession();
  const isHr = !!session?.roles.includes("hr");
  const [filters, setFilters] = useState<EmployeeFilters>(EMPTY_EMPLOYEE_FILTERS);
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<EmployeeAdminRow | "new" | null>(null);
  const [prefill, setPrefill] = useState<AccountPrefill | null>(null);
  const opts = useOrgOptions();

  // debounce the search box so each keystroke doesn't hit the database
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, term }));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const set = (patch: Partial<EmployeeFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const employees = useQuery({
    queryKey: ["employees-admin", filters, page],
    queryFn: () => fetchEmployeesAdmin(filters, page),
    placeholderData: (prev) => prev,
  });

  const rows = employees.data?.rows ?? [];
  const total = employees.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE));
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_EMPLOYEE_FILTERS) || term !== "";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">الموظفون</h1>
          <p className="mt-1 text-sm text-muted-foreground">البحث بكود الموظف أو الاسم مع تصفية متعددة.</p>
        </div>
        {isHr ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild className="h-11">
              <Link to="/employees-import">
                <Upload className="size-4" /> استيراد
              </Link>
            </Button>
            <Button className="h-11" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> إضافة موظف
            </Button>
          </div>
        ) : null}
      </header>

      {isHr ? (
        <UnlinkedAccounts
          onComplete={(a) => {
            setPrefill(a);
            setEditing("new");
          }}
        />
      ) : null}

      <div className="surface-card space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="h-12 pe-11 text-base"
            placeholder="ابحث بكود الموظف أو الاسم أو البريد"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="بحث الموظفين"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Select value={filters.departmentId} onValueChange={(v) => set({ departmentId: v })}>
            <SelectTrigger className="h-11" aria-label="القسم">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأقسام</SelectItem>
              {opts.departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PersonSelect label="المشرف" allLabel="جميع المشرفين" value={filters.supervisorId} onChange={(v) => set({ supervisorId: v })} people={opts.supervisors} />
          <PersonSelect label="المدير" allLabel="جميع المديرين" value={filters.managerId} onChange={(v) => set({ managerId: v })} people={opts.managers} />
          <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger className="h-11" aria-label="الحالة"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.account} onValueChange={(v) => set({ account: v })}>
            <SelectTrigger className="h-11" aria-label="حالة الحساب"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل حالات الحساب</SelectItem>
              <SelectItem value="linked">مرتبط بحساب</SelectItem>
              <SelectItem value="unlinked">بدون حساب</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>عدد النتائج: {total}</span>
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => { setTerm(""); setFilters(EMPTY_EMPLOYEE_FILTERS); setPage(0); }}>
              مسح الفلاتر
            </Button>
          ) : null}
        </div>
      </div>

      {employees.isPending ? (
        <LoadingState />
      ) : employees.isError ? (
        <ErrorState onRetry={() => employees.refetch()} />
      ) : rows.length === 0 ? (
        <div className="surface-card">
          <EmptyState title="لا يوجد موظفون مطابقون" description="لا توجد نتائج مطابقة لعوامل التصفية الحالية." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 lg:hidden">
            {rows.map((emp) => (
              <li key={emp.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold tabular-nums text-primary">{emp.employee_code}</p>
                    <p className="truncate font-semibold">{emp.full_name}</p>
                  </div>
                  <ActiveBadge active={emp.is_active} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">القسم</dt><dd>{emp.departments?.name ?? "غير محدد"}</dd>
                  <dt className="text-muted-foreground">المشرف</dt><dd className="truncate">{emp.supervisor?.full_name?.trim() || "—"}</dd>
                  <dt className="text-muted-foreground">المدير</dt><dd className="truncate">{emp.manager?.full_name?.trim() || "—"}</dd>
                  <dt className="text-muted-foreground">الحساب</dt><dd>{emp.profile_id ? "مرتبط" : "بدون حساب"}</dd>
                </dl>
                {emp.email ? <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{emp.email}</p> : null}
                {isHr ? (
                  <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => setEditing(emp)}>
                    <Pencil className="size-4" /> تعديل
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="surface-card hidden overflow-hidden lg:block">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-semibold">كود الموظف</th>
                  <th className="px-3 py-3 font-semibold">الاسم</th>
                  <th className="px-3 py-3 font-semibold">القسم</th>
                  <th className="px-3 py-3 font-semibold">المشرف</th>
                  <th className="px-3 py-3 font-semibold">المدير</th>
                  <th className="px-3 py-3 font-semibold">البريد الإلكتروني</th>
                  <th className="px-3 py-3 font-semibold">الحساب</th>
                  <th className="px-3 py-3 font-semibold">الحالة</th>
                  {isHr ? <th className="px-3 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((emp) => (
                  <tr key={emp.id} className="border-t">
                    <td className="px-3 py-2.5 font-bold tabular-nums text-primary">{emp.employee_code}</td>
                    <td className="px-3 py-2.5">{emp.full_name}</td>
                    <td className="px-3 py-2.5">{emp.departments?.name ?? "غير محدد"}</td>
                    <td className="px-3 py-2.5">{emp.supervisor?.full_name?.trim() || "—"}</td>
                    <td className="px-3 py-2.5">{emp.manager?.full_name?.trim() || "—"}</td>
                    <td className="max-w-48 truncate px-3 py-2.5" dir="ltr">{emp.email ?? "—"}</td>
                    <td className="px-3 py-2.5">{emp.profile_id ? "مرتبط" : "بدون حساب"}</td>
                    <td className="px-3 py-2.5"><ActiveBadge active={emp.is_active} /></td>
                    {isHr ? (
                      <td className="px-3 py-2.5">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(emp)} aria-label="تعديل">
                          <Pencil className="size-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" className="size-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="الصفحة السابقة">
              <ChevronRight className="size-5" />
            </Button>
            <span className="text-sm tabular-nums">صفحة {page + 1} من {pages}</span>
            <Button variant="outline" size="icon" className="size-11" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="الصفحة التالية">
              <ChevronLeft className="size-5" />
            </Button>
          </div>
        </>
      )}

      {editing ? (
        <EmployeeDialog
          employee={editing === "new" ? null : editing}
          prefill={editing === "new" ? prefill : null}
          onClose={() => {
            setEditing(null);
            setPrefill(null);
          }}
          departments={opts.departments}
          supervisors={opts.supervisors}
          managers={opts.managers}
        />
      ) : null}
    </div>
  );
}

function EmployeeDialog({
  employee,
  prefill,
  onClose,
  departments,
  supervisors,
  managers,
}: {
  employee: EmployeeAdminRow | null;
  prefill?: AccountPrefill | null;
  onClose: () => void;
  departments: { id: string; name: string }[];
  supervisors: PersonRef[];
  managers: PersonRef[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    employee_code: employee?.employee_code ?? "",
    full_name: employee?.full_name ?? prefill?.full_name ?? "",
    email: employee?.email ?? prefill?.email ?? "",
    job_title: employee?.job_title ?? "",
    department_id: employee?.department_id ?? NONE,
    supervisor_id: employee?.supervisor_id ?? NONE,
    manager_id: employee?.manager_id ?? NONE,
    is_active: employee?.is_active ?? true,
    requires_manager_approval: employee?.requires_manager_approval ?? true,
    unlink: false,
  });
  const [error, setError] = useState<string | null>(null);

  // keep the currently assigned person selectable even if they no longer hold the role
  const withCurrent = (list: PersonRef[], cur: PersonRef | null | undefined) =>
    cur && !list.some((p) => p.id === cur.id) ? [cur, ...list] : list;
  const supList = withCurrent(supervisors, employee?.supervisor).filter((p) => p.id !== employee?.id);
  const mgrList = withCurrent(managers, employee?.manager).filter((p) => p.id !== employee?.id);

  const save = useMutation({
    mutationFn: async () => {
      const code = form.employee_code.trim();
      if (!code) throw new Error("employee_code_required");
      if (!form.full_name.trim()) throw new Error("full_name_required");
      const payload = {
        employee_code: code,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        job_title: form.job_title.trim() || null,
        department_id: form.department_id === NONE ? null : form.department_id,
        supervisor_id: form.supervisor_id === NONE ? null : form.supervisor_id,
        manager_id: form.manager_id === NONE ? null : form.manager_id,
        is_active: form.is_active,
        requires_manager_approval: form.requires_manager_approval,
        ...(form.unlink ? { profile_id: null } : {}),
        ...(!employee && prefill ? { profile_id: prefill.user_id } : {}),
      };
      const { error: e } = employee
        ? await supabase.from("employees").update(payload).eq("id", employee.id)
        : await supabase.from("employees").insert(payload);
      if (e) throw e;
    },
    onSuccess: () => {
      toast.success(employee ? "تم حفظ بيانات الموظف" : "تمت إضافة الموظف");
      qc.invalidateQueries({ queryKey: ["employees-admin"] });
      qc.invalidateQueries({ queryKey: ["people-role"] });
      qc.invalidateQueries({ queryKey: ["unlinked-accounts"] });
      qc.invalidateQueries({ queryKey: ["org-people"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
    },
    onError: (e) => setError(employeeErrorMessage(e)),
  });

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? "تعديل بيانات الموظف" : "إضافة موظف"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-code">كود الموظف *</Label>
              <Input id="emp-code" className="h-11 tabular-nums" value={form.employee_code} onChange={field("employee_code")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">الاسم الكامل *</Label>
              <Input id="emp-name" className="h-11" value={form.full_name} onChange={field("full_name")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">البريد الإلكتروني</Label>
              <Input id="emp-email" type="email" dir="ltr" className="h-11" value={form.email} onChange={field("email")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-job">المسمى الوظيفي</Label>
              <Input id="emp-job" className="h-11" value={form.job_title} onChange={field("job_title")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>القسم</Label>
            <Select value={form.department_id} onValueChange={(v) => setForm((f) => ({ ...f, department_id: v }))}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>بدون قسم</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>المشرف</Label>
              <Select value={form.supervisor_id} onValueChange={(v) => setForm((f) => ({ ...f, supervisor_id: v }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون مشرف</SelectItem>
                  {supList.map((p) => <SelectItem key={p.id} value={p.id}>{p.employee_code} — {p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>المدير</Label>
              <Select value={form.manager_id} onValueChange={(v) => setForm((f) => ({ ...f, manager_id: v }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون مدير</SelectItem>
                  {mgrList.map((p) => <SelectItem key={p.id} value={p.id}>{p.employee_code} — {p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm">يحتاج اعتماد المدير؟</span>
            <Switch checked={form.requires_manager_approval} onCheckedChange={(v) => setForm((f) => ({ ...f, requires_manager_approval: v }))} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm">الموظف نشط</span>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </label>
          {employee?.profile_id ? (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm">فك ارتباط الحساب بهذا الموظف</span>
              <Switch checked={form.unlink} onCheckedChange={(v) => setForm((f) => ({ ...f, unlink: v }))} />
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              يتم ربط الحساب تلقائيًا عندما يطابق البريد الإلكتروني حسابًا مسجلًا في النظام.
            </p>
          )}
          {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>إلغاء</Button>
            <Button type="submit" className="h-11" disabled={save.isPending}>
              {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AccountPrefill {
  user_id: string;
  email: string;
  full_name: string;
}

/** Sign-in accounts that exist but have no employee record yet (HR only, checked in the database). */
function UnlinkedAccounts({ onComplete }: { onComplete: (a: AccountPrefill) => void }) {
  const query = useQuery({
    queryKey: ["unlinked-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unlinked_accounts");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  if (!query.data || query.data.length === 0) return null;
  return (
    <div className="surface-card space-y-2 p-4">
      <p className="font-semibold">حسابات بدون ملف موظف ({query.data.length})</p>
      <p className="text-xs text-muted-foreground">
        هذه الحسابات مسجلة في النظام لكن غير مرتبطة بموظف، لذلك لا تظهر في قوائم الموظفين والمشرفين. أكمل بياناتها لربطها.
      </p>
      <ul className="divide-y">
        {query.data.map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{a.full_name || "بدون اسم"}</span>
              <span className="block truncate text-xs text-muted-foreground" dir="ltr">{a.email}</span>
              <span className="block text-xs text-muted-foreground">
                {(a.roles ?? []).map((r) => ROLE_LABELS[r as AppRole]).join("، ")}
              </span>
            </span>
            <Button
              size="sm"
              className="h-10"
              onClick={() => onComplete({ user_id: a.user_id, email: a.email ?? "", full_name: a.full_name ?? "" })}
            >
              إكمال ملف الموظف
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
