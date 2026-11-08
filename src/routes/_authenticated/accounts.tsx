import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  UserCheck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequireRole } from "@/components/common/require-role";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ActiveBadge } from "@/components/common/status-badge";
import { ROLE_LABELS, type AppRole } from "@/lib/labels";
import { fetchPeopleWithRole, type PersonRef } from "@/lib/employees";
import {
  EMPTY_ACCOUNT_FILTERS,
  accountErrorMessage,
  createEmployeeAccount,
  fetchEmployeeAccounts,
  fetchUnlinkedAccounts,
  linkEmployeeToAccount,
  resetEmployeePassword,
  toggleAccountStatus,
  updateEmployeeAccount,
  type AccountFilters,
  type AccountRow,
  type CreateAccountPayload,
  type UpdateAccountPayload,
} from "@/lib/account-management";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "إدارة الموظفين والحسابات | نظام الإجازات والعمل الإضافي" },
      {
        name: "description",
        content: "إدارة حسابات الموظفين والصلاحيات وكلمات المرور وتعيين المشرفين والمديرين مباشرة.",
      },
      { property: "og:title", content: "إدارة الموظفين والحسابات | نظام الإجازات والعمل الإضافي" },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <AccountsPage />
    </RequireRole>
  ),
});

const NONE = "none";

function RoleBadge({ role }: { role: AppRole }) {
  const styles: Record<AppRole, string> = {
    hr: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    manager:
      "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    supervisor:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    employee:
      "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${styles[role] || styles.employee}`}
    >
      {ROLE_LABELS[role] || "موظف"}
    </span>
  );
}

function AccountsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<AccountFilters>(EMPTY_ACCOUNT_FILTERS);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [resetModalAccount, setResetModalAccount] = useState<AccountRow | null>(null);
  const [linkModalAccount, setLinkModalAccount] = useState<AccountRow | null>(null);

  // Queries
  const {
    data: accounts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["employee-accounts", filters],
    queryFn: () => fetchEmployeeAccounts(filters),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["people-role", "supervisor"],
    queryFn: () => fetchPeopleWithRole("supervisor"),
  });

  const { data: managers = [] } = useQuery({
    queryKey: ["people-role", "manager"],
    queryFn: () => fetchPeopleWithRole("manager"),
  });

  // Mutations
  const toggleStatusMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      toggleAccountStatus(id, active),
    onSuccess: (_, vars) => {
      toast.success(vars.active ? "تم تفعيل الحساب بنجاح" : "تم تعطيل الحساب بنجاح");
      qc.invalidateQueries({ queryKey: ["employee-accounts"] });
      qc.invalidateQueries({ queryKey: ["employees-admin"] });
    },
    onError: (err) => toast.error(accountErrorMessage(err)),
  });

  const dirty =
    filters.search !== "" ||
    filters.departmentId !== "all" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.accountStatus !== "all";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl flex items-center gap-2">
            <UserCog className="size-6 text-primary" />
            إدارة الموظفين والحسابات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إنشاء حسابات الموظفين والمشرفين والمديرين، وتعيين الصلاحيات وكلمات المرور والتدرج
            الإداري.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingAccount(null);
            setFormModalOpen(true);
          }}
          className="h-11 gap-2 font-semibold shadow-sm"
        >
          <Plus className="size-5" /> إضافة موظف جديد
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="surface-card space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Input */}
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pr-9"
              placeholder="بحث بالاسم أو الكود أو البريد…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          {/* Department Select */}
          <Select
            value={filters.departmentId}
            onValueChange={(v) => setFilters((f) => ({ ...f, departmentId: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="جميع الإدارات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الإدارات</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Role Select */}
          <Select
            value={filters.role}
            onValueChange={(v) => setFilters((f) => ({ ...f, role: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="جميع الصلاحيات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الصلاحيات</SelectItem>
              <SelectItem value="employee">موظف</SelectItem>
              <SelectItem value="supervisor">مشرف</SelectItem>
              <SelectItem value="manager">مدير</SelectItem>
              <SelectItem value="hr">موارد بشرية</SelectItem>
            </SelectContent>
          </Select>

          {/* Account Status */}
          <Select
            value={filters.accountStatus}
            onValueChange={(v) => setFilters((f) => ({ ...f, accountStatus: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="حالة الحساب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحسابات</SelectItem>
              <SelectItem value="linked">مرتبط بحساب دخول</SelectItem>
              <SelectItem value="unlinked">بدون حساب دخول</SelectItem>
            </SelectContent>
          </Select>

          {/* Activity Status */}
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="active">نشط فقط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
          <span>
            عدد الموظفين: <b className="text-foreground">{accounts.length}</b>
          </span>
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_ACCOUNT_FILTERS)}>
              إعادة تعيين الفلاتر
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : accounts.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            title="لا توجد نتائج مطابقة"
            description="لم يتم العثور على أي موظف مطابق لعوامل التصفية أو البحث الحالية."
          />
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="space-y-3 lg:hidden">
            {accounts.map((acc) => (
              <div key={acc.id} className="surface-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold tabular-nums text-primary text-sm">
                      {acc.employee_code}
                    </span>
                    <h3 className="font-bold text-base">{acc.full_name}</h3>
                    {acc.email ? (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {acc.email}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <ActiveBadge active={acc.is_active} />
                    <RoleBadge role={acc.role} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-y py-2.5">
                  <div>
                    <span className="text-muted-foreground block">القسم:</span>
                    <span className="font-medium">{acc.department_name || "غير محدد"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">المسمى:</span>
                    <span className="font-medium">{acc.job_title || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">المشرف المباشر:</span>
                    <span className="font-medium">{acc.supervisor_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">المدير المباشر:</span>
                    <span className="font-medium">{acc.manager_name || "—"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9"
                    onClick={() => {
                      setEditingAccount(acc);
                      setFormModalOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5 ml-1" /> تعديل
                  </Button>

                  {acc.profile_id ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setResetModalAccount(acc)}
                      title="تعيين كلمة مرور جديدة"
                    >
                      <KeyRound className="size-3.5 ml-1" /> كلمة المرور
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9"
                      onClick={() => setLinkModalAccount(acc)}
                    >
                      <Link2 className="size-3.5 ml-1" /> ربط بحساب
                    </Button>
                  )}

                  <Button
                    variant={acc.is_active ? "ghost" : "outline"}
                    size="sm"
                    className={`h-9 px-3 ${acc.is_active ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10"}`}
                    onClick={() => toggleStatusMut.mutate({ id: acc.id, active: !acc.is_active })}
                    disabled={toggleStatusMut.isPending}
                  >
                    <Power className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="surface-card hidden overflow-x-auto lg:block">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted text-muted-foreground font-semibold">
                <tr>
                  <th className="px-3 py-3">كود الموظف</th>
                  <th className="px-3 py-3">الاسم الكامل</th>
                  <th className="px-3 py-3">البريد الإلكتروني</th>
                  <th className="px-3 py-3">القسم</th>
                  <th className="px-3 py-3">الصلاحية</th>
                  <th className="px-3 py-3">المشرف</th>
                  <th className="px-3 py-3">المدير</th>
                  <th className="px-3 py-3">حساب الدخول</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 font-bold tabular-nums text-primary">
                      {acc.employee_code}
                    </td>
                    <td className="px-3 py-3 font-semibold">{acc.full_name}</td>
                    <td className="px-3 py-3 text-xs" dir="ltr">
                      {acc.email || "—"}
                    </td>
                    <td className="px-3 py-3">{acc.department_name || "—"}</td>
                    <td className="px-3 py-3">
                      <RoleBadge role={acc.role} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {acc.supervisor_name || "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{acc.manager_name || "—"}</td>
                    <td className="px-3 py-3">
                      {acc.profile_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                          <UserCheck className="size-3.5" /> مفعّل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                          <UserX className="size-3.5" /> غير مرتبط
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ActiveBadge active={acc.is_active} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setEditingAccount(acc);
                            setFormModalOpen(true);
                          }}
                          title="تعديل الموظف والصلاحيات"
                        >
                          <Pencil className="size-4" />
                        </Button>

                        {acc.profile_id ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setResetModalAccount(acc)}
                            title="تغيير كلمة المرور"
                          >
                            <KeyRound className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-primary"
                            onClick={() => setLinkModalAccount(acc)}
                            title="ربط بحساب مستخدم مسجل"
                          >
                            <Link2 className="size-4" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className={`size-8 ${acc.is_active ? "text-destructive hover:bg-destructive/10" : "text-success hover:bg-success/10"}`}
                          onClick={() =>
                            toggleStatusMut.mutate({ id: acc.id, active: !acc.is_active })
                          }
                          disabled={toggleStatusMut.isPending}
                          title={acc.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}
                        >
                          <Power className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Account Form Modal (Create or Edit) */}
      {formModalOpen ? (
        <AccountFormDialog
          account={editingAccount}
          departments={departments}
          supervisors={supervisors}
          managers={managers}
          onClose={() => {
            setFormModalOpen(false);
            setEditingAccount(null);
          }}
        />
      ) : null}

      {/* Reset Password Modal */}
      {resetModalAccount ? (
        <ResetPasswordDialog
          account={resetModalAccount}
          onClose={() => setResetModalAccount(null)}
        />
      ) : null}

      {/* Link Account Modal */}
      {linkModalAccount ? (
        <LinkAccountDialog account={linkModalAccount} onClose={() => setLinkModalAccount(null)} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog 1: Add or Edit Employee & Account
 * ------------------------------------------------------------------ */

function AccountFormDialog({
  account,
  departments,
  supervisors,
  managers,
  onClose,
}: {
  account: AccountRow | null;
  departments: { id: string; name: string }[];
  supervisors: PersonRef[];
  managers: PersonRef[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!account;

  const [fullName, setFullName] = useState(account?.full_name || "");
  const [employeeCode, setEmployeeCode] = useState(account?.employee_code || "");
  const [email, setEmail] = useState(account?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>(account?.role || "employee");
  const [departmentId, setDepartmentId] = useState(account?.department_id || NONE);
  const [jobTitle, setJobTitle] = useState(account?.job_title || "");
  const [supervisorId, setSupervisorId] = useState(account?.supervisor_id || NONE);
  const [managerId, setManagerId] = useState(account?.manager_id || NONE);
  const [requiresManagerApproval, setRequiresManagerApproval] = useState(
    account ? account.requires_manager_approval : true,
  );
  const [isActive, setIsActive] = useState(account ? account.is_active : true);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const payload: UpdateAccountPayload = {
          employee_id: account!.id,
          full_name: fullName.trim(),
          employee_code: employeeCode.trim(),
          email: email.trim(),
          role,
          department_id: departmentId === NONE ? null : departmentId,
          job_title: jobTitle.trim() || null,
          supervisor_id: supervisorId === NONE ? null : supervisorId,
          manager_id: managerId === NONE ? null : managerId,
          requires_manager_approval: requiresManagerApproval,
          is_active: isActive,
        };
        return updateEmployeeAccount(payload);
      } else {
        const payload: CreateAccountPayload = {
          full_name: fullName.trim(),
          employee_code: employeeCode.trim(),
          email: email.trim(),
          password,
          role,
          department_id: departmentId === NONE ? null : departmentId,
          job_title: jobTitle.trim() || null,
          supervisor_id: supervisorId === NONE ? null : supervisorId,
          manager_id: managerId === NONE ? null : managerId,
          requires_manager_approval: requiresManagerApproval,
          is_active: isActive,
        };
        return createEmployeeAccount(payload);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "تم تحديث بيانات الموظف بنجاح" : "تم إنشاء حساب الموظف بنجاح");
      qc.invalidateQueries({ queryKey: ["employee-accounts"] });
      qc.invalidateQueries({ queryKey: ["employees-admin"] });
      qc.invalidateQueries({ queryKey: ["people-role"] });
      onClose();
    },
    onError: (err) => {
      toast.error(accountErrorMessage(err));
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {isEdit ? "تعديل بيانات وحساب الموظف" : "إضافة موظف وحساب جديد"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "تعديل البيانات الأساسية، وتحديث الصلاحية والتدرج الإداري."
              : "إنشاء حساب دخول في النظام وملف موظف مرتبط في خطوة واحدة آمنة."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4 pt-2"
        >
          {/* Row 1: Name and Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="fn">اسم الموظف الكامل *</Label>
              <Input
                id="fn"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="أحمد محمد علي"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="code">كود الموظف *</Label>
              <Input
                id="code"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP-1001"
                required
              />
            </div>
          </div>

          {/* Row 2: Email and Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="em">البريد الإلكتروني *</Label>
              <Input
                id="em"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@factory.com"
                required
              />
            </div>
            {!isEdit ? (
              <div className="space-y-1">
                <Label htmlFor="pw">كلمة المرور الأولية *</Label>
                <Input
                  id="pw"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="٦ أحرف على الأقل"
                  required
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="jt">المسمى الوظيفي</Label>
                <Input
                  id="jt"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="مهندس إنتاج، فني، إلخ…"
                />
              </div>
            )}
          </div>

          {/* Row 3: Role and Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>صلاحية الحساب *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">موظف (تقديم طلبات شخصية)</SelectItem>
                  <SelectItem value="supervisor">مشرف (متابعة وإشراف على فريقه)</SelectItem>
                  <SelectItem value="manager">مدير (اعتماد وإدارة مرؤوسين)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>الإدارة / القسم</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الإدارة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون إدارة محددة</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEdit ? (
            <div className="space-y-1">
              <Label htmlFor="jt">المسمى الوظيفي</Label>
              <Input
                id="jt"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="مهندس إنتاج، فني صيانة، محاسب، إلخ…"
              />
            </div>
          ) : null}

          {/* Row 4: Supervisor and Manager */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>المشرف المباشر</Label>
              <Select value={supervisorId} onValueChange={setSupervisorId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المشرف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون مشرف</SelectItem>
                  {supervisors
                    .filter((s) => s.id !== account?.id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name} ({s.employee_code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>المدير المباشر</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المدير" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون مدير</SelectItem>
                  {managers
                    .filter((m) => m.id !== account?.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name} ({m.employee_code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Approval & Active Toggles */}
          <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="font-semibold text-sm cursor-pointer">
                  يتطلب موافقة المدير على الإجازات؟
                </Label>
                <p className="text-xs text-muted-foreground">
                  عند التفعيل يمر طلب الإجازة بالمدير أولاً قبل اعتماده من الموارد البشرية.
                </p>
              </div>
              <Switch
                checked={requiresManagerApproval}
                onCheckedChange={setRequiresManagerApproval}
              />
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-2.5">
              <div>
                <Label className="font-semibold text-sm cursor-pointer">حالة الحساب نشطة؟</Label>
                <p className="text-xs text-muted-foreground">
                  الحسابات غير النشطة لا يمكنها تسجيل الدخول أو إرسال طلبات.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              إلغاء
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin ml-2" /> جارٍ الحفظ…
                </>
              ) : isEdit ? (
                "حفظ التعديلات"
              ) : (
                "إنشاء الموظف والحساب"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog 2: Reset Password Modal
 * ------------------------------------------------------------------ */

function ResetPasswordDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => resetEmployeePassword(account.id, newPassword),
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور بنجاح");
      onClose();
    },
    onError: (err) => toast.error(accountErrorMessage(err)),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" /> إعادة تعيين كلمة المرور
          </DialogTitle>
          <DialogDescription>
            تغيير كلمة المرور لحساب الموظف: <b>{account.full_name}</b> ({account.email})
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-1">
            <Label htmlFor="np">كلمة المرور الجديدة *</Label>
            <Input
              id="np"
              type="password"
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="٦ أحرف أو أرقام على الأقل"
              required
              minLength={6}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              إلغاء
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin ml-2" /> : null}
              تأكيد التغيير
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog 3: Link Account Modal
 * ------------------------------------------------------------------ */

function LinkAccountDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<AppRole>(account.role || "employee");

  const { data: unlinked = [], isLoading } = useQuery({
    queryKey: ["unlinked-accounts"],
    queryFn: fetchUnlinkedAccounts,
  });

  const mutation = useMutation({
    mutationFn: () => linkEmployeeToAccount(account.id, selectedUserId, selectedRole),
    onSuccess: () => {
      toast.success("تم ربط الحساب بملف الموظف بنجاح");
      qc.invalidateQueries({ queryKey: ["employee-accounts"] });
      qc.invalidateQueries({ queryKey: ["unlinked-accounts"] });
      qc.invalidateQueries({ queryKey: ["employees-admin"] });
      onClose();
    },
    onError: (err) => toast.error(accountErrorMessage(err)),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-5 text-primary" /> ربط ملف الموظف بحساب مسجل
          </DialogTitle>
          <DialogDescription>
            ربط ملف الموظف <b>{account.full_name}</b> ({account.employee_code}) بحساب مسجل غير
            مرتبط.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!selectedUserId) {
              toast.error("يرجى اختيار حساب للربط");
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4 pt-2"
        >
          {isLoading ? (
            <LoadingState />
          ) : unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 bg-muted rounded-md text-center">
              لا توجد حسابات مسجلة غير مرتبطة حالياً. يمكنك استخدام زر "إضافة موظف جديد" لإنشاء حساب
              كامل.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>اختر حساب المستخدم *</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الحساب المسجل" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinked.map((u: { user_id: string; full_name: string; email: string }) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name || "بدون اسم"} — {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>الصلاحية المسندة للحساب</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">موظف</SelectItem>
                    <SelectItem value="supervisor">مشرف</SelectItem>
                    <SelectItem value="manager">مدير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || unlinked.length === 0 || !selectedUserId}
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin ml-2" /> : null}
              تأكيد الربط
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
