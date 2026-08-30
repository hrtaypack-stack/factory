import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { RequireRole } from "@/components/common/require-role";
import { ActiveBadge } from "@/components/common/status-badge";
import { fetchLeaveTypes, leaveErrorMessage } from "@/lib/leave";

export const Route = createFileRoute("/_authenticated/leave-types")({
  head: () => ({
    meta: [
      { title: "أنواع الإجازات | نظام الإجازات والعمل الإضافي" },
      { name: "description", content: "إعداد أنواع الإجازات المتاحة والحد السنوي لكل نوع." },
      { property: "og:title", content: "أنواع الإجازات | نظام الإجازات والعمل الإضافي" },
      { property: "og:description", content: "إعداد أنواع الإجازات المتاحة والحد السنوي لكل نوع." },
    ],
  }),
  component: () => (
    <RequireRole roles={["hr"]}>
      <LeaveTypesPage />
    </RequireRole>
  ),
});

interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_paid: boolean;
  max_days_per_year: number | null;
  is_active: boolean;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  is_paid: boolean;
  max_days_per_year: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  is_paid: true,
  max_days_per_year: "",
  is_active: true,
};

function LeaveTypeDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LeaveTypeRow | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            description: editing.description ?? "",
            is_paid: editing.is_paid,
            max_days_per_year: editing.max_days_per_year?.toString() ?? "",
            is_active: editing.is_active,
          }
        : EMPTY_FORM,
    );
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_paid: form.is_paid,
        max_days_per_year: form.max_days_per_year.trim() ? Number(form.max_days_per_year) : null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("leave_types").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leave_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث نوع الإجازة" : "تم إضافة نوع الإجازة");
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(leaveErrorMessage(e)),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next["code"] = "الرمز مطلوب.";
    if (!form.name.trim()) next["name"] = "الاسم مطلوب.";
    const days = form.max_days_per_year.trim();
    if (days && (!/^\d+$/.test(days) || Number(days) <= 0))
      next["max_days_per_year"] = "يجب أن يكون الحد السنوي رقمًا صحيحًا أكبر من صفر.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل نوع الإجازة" : "إضافة نوع إجازة"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lt-name" className="text-base">
              الاسم
            </Label>
            <Input
              id="lt-name"
              className="h-12 text-base"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors["name"] ? <p className="text-sm text-destructive">{errors["name"]}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lt-code" className="text-base">
              الرمز
            </Label>
            <Input
              id="lt-code"
              className="h-12 text-base"
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            {errors["code"] ? <p className="text-sm text-destructive">{errors["code"]}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lt-days" className="text-base">
              الحد السنوي (اختياري)
            </Label>
            <Input
              id="lt-days"
              className="h-12 text-base"
              inputMode="numeric"
              value={form.max_days_per_year}
              onChange={(e) => setForm({ ...form, max_days_per_year: e.target.value })}
            />
            {errors["max_days_per_year"] ? (
              <p className="text-sm text-destructive">{errors["max_days_per_year"]}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lt-desc" className="text-base">
              الوصف (اختياري)
            </Label>
            <Textarea
              id="lt-desc"
              rows={2}
              className="text-base"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-base">إجازة مدفوعة</span>
            <Switch
              checked={form.is_paid}
              onCheckedChange={(v) => setForm({ ...form, is_paid: v })}
              aria-label="إجازة مدفوعة"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-base">نشط</span>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              aria-label="نشط"
            />
          </label>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row-reverse">
          <Button
            size="lg"
            className="h-12 w-full text-base sm:w-auto"
            disabled={save.isPending}
            onClick={submit}
          >
            {save.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            حفظ
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full text-base sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveTypeRow | null>(null);

  const query = useQuery({
    queryKey: ["leave-types", "all"],
    queryFn: () => fetchLeaveTypes(false) as Promise<LeaveTypeRow[]>,
  });

  const toggleActive = useMutation({
    mutationFn: async (row: LeaveTypeRow) => {
      const { error } = await supabase
        .from("leave_types")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث حالة نوع الإجازة");
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
    },
    onError: (e) => toast.error(leaveErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">أنواع الإجازات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الأنواع المعتمدة داخل النظام، وتُستخدم عند تقديم طلبات الإجازة.
          </p>
        </div>
        <Button
          size="lg"
          className="h-12"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-5" aria-hidden />
          إضافة نوع إجازة
        </Button>
      </header>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <div className="surface-card">
          <EmptyState title="لا توجد أنواع إجازات" />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {query.data.map((t) => (
            <li key={t.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">الرمز: {t.code}</p>
                </div>
                <ActiveBadge active={t.is_active} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.is_paid ? "مدفوعة" : "غير مدفوعة"} —{" "}
                {t.max_days_per_year ? `الحد السنوي: ${t.max_days_per_year} يوم` : "بدون حد سنوي"}
              </p>
              {t.description ? <p className="mt-1 text-sm">{t.description}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11"
                  onClick={() => {
                    setEditing(t);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                  تعديل
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="h-11"
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate(t)}
                >
                  {t.is_active ? "إيقاف" : "تنشيط"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LeaveTypeDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
