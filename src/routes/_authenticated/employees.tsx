import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ActiveBadge } from "@/components/common/status-badge";
import { RequireRole } from "@/components/common/require-role";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "الموظفون | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "بحث وعرض بيانات الموظفين بكود الموظف والاسم والإدارة." },
      { property: "og:title", content: "الموظفون | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "بحث وعرض بيانات الموظفين بكود الموظف والاسم والإدارة." },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr", "manager", "supervisor"]}>
      <EmployeesPage />
    </RequireRole>
  ),
});

interface EmployeeRow {
  id: string;
  employee_code: string;
  full_name: string;
  job_title: string | null;
  is_active: boolean;
  requires_manager_approval: boolean;
  departments: { id: string; name: string } | null;
}

function EmployeesPage() {
  const [term, setTerm] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const employees = useQuery({
    queryKey: ["employees", term, departmentId, status],
    queryFn: async () => {
      let query = supabase
        .from("employees")
        .select("id, employee_code, full_name, job_title, is_active, requires_manager_approval, departments(id, name)")
        .order("employee_code")
        .limit(200);

      const t = term.trim();
      if (t) query = query.or(`employee_code.ilike.%${t}%,full_name.ilike.%${t}%`);
      if (departmentId !== "all") query = query.eq("department_id", departmentId);
      if (status !== "all") query = query.eq("is_active", status === "active");

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeRow[];
    },
  });

  const rows = useMemo(() => employees.data ?? [], [employees.data]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold lg:text-2xl">الموظفون</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          البحث بكود الموظف أو الاسم، مع إمكانية التصفية حسب الإدارة والحالة.
        </p>
      </header>

      <div className="surface-card space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="h-12 pe-11 text-base"
            placeholder="ابحث بكود الموظف أو الاسم"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="بحث الموظفين"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-12 text-base" aria-label="تصفية حسب الإدارة">
              <SelectValue placeholder="جميع الإدارات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الإدارات</SelectItem>
              {(departments.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-12 text-base" aria-label="تصفية حسب الحالة">
              <SelectValue placeholder="جميع الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {employees.isPending ? (
        <LoadingState />
      ) : employees.isError ? (
        <ErrorState onRetry={() => employees.refetch()} />
      ) : rows.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title="لا يوجد موظفون مطابقون"
            description="لم تُضف بيانات الموظفين بعد، أو لا توجد نتائج مطابقة لعوامل التصفية الحالية."
          />
        </div>
      ) : (
        <>
          {/* Mobile: compact cards */}
          <ul className="space-y-3 lg:hidden">
            {rows.map((emp) => (
              <li key={emp.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{emp.full_name}</p>
                    <p className="text-xs text-muted-foreground">كود: {emp.employee_code}</p>
                  </div>
                  <ActiveBadge active={emp.is_active} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {emp.departments?.name ?? "بدون إدارة"}
                  {emp.job_title ? ` — ${emp.job_title}` : ""}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop: dense table */}
          <div className="surface-card hidden overflow-hidden lg:block">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">كود الموظف</th>
                  <th className="px-4 py-3 font-semibold">الاسم</th>
                  <th className="px-4 py-3 font-semibold">الإدارة</th>
                  <th className="px-4 py-3 font-semibold">المسمى الوظيفي</th>
                  <th className="px-4 py-3 font-semibold">موافقة المدير</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((emp) => (
                  <tr key={emp.id} className="border-t">
                    <td className="px-4 py-3 font-medium tabular-nums">{emp.employee_code}</td>
                    <td className="px-4 py-3">{emp.full_name}</td>
                    <td className="px-4 py-3">{emp.departments?.name ?? "—"}</td>
                    <td className="px-4 py-3">{emp.job_title ?? "—"}</td>
                    <td className="px-4 py-3">{emp.requires_manager_approval ? "مطلوبة" : "غير مطلوبة"}</td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={emp.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
