import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog, ReasonDialog } from "@/components/leave/decision-dialogs";
import { OvertimeForm } from "@/components/overtime/overtime-form";
import type { SessionInfo } from "@/hooks/use-session";
import { formatDate, formatDateTime } from "@/lib/leave";
import {
  CANCELLABLE_OVERTIME_STATUSES,
  decideOvertimeRequests,
  isOvertimeEditable,
  overtimeErrorMessage,
  shiftLabel,
  type OvertimeRequestRow,
} from "@/lib/overtime";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  );
}

export function OvertimeDetailDialog({
  request,
  session,
  requesterName,
  open,
  onOpenChange,
}: {
  request: OvertimeRequestRow | null;
  session: SessionInfo;
  requesterName?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const decide = useMutation({
    mutationFn: (args: { action: "approve" | "reject" | "cancel"; reason?: string }) =>
      decideOvertimeRequests([request!.id], args.action, args.reason),
    onSuccess: (_count, args) => {
      toast.success(
        args.action === "approve"
          ? "تم اعتماد تكليف العمل الإضافي"
          : args.action === "reject"
            ? "تم رفض تكليف العمل الإضافي"
            : "تم إلغاء تكليف العمل الإضافي",
      );
      queryClient.invalidateQueries({ queryKey: ["overtime-requests"] });
      queryClient.invalidateQueries({ queryKey: ["overtime-counters"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setConfirmApprove(false);
      setConfirmCancel(false);
      setRejectOpen(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(overtimeErrorMessage(e)),
  });

  if (!request) return null;

  const isHr = session.roles.includes("hr");
  const myEmployeeId = session.employee?.id ?? null;
  const canManagerAct =
    request.status === "pending_manager" &&
    !!request.manager_id && request.manager_id === myEmployeeId;
  const canHrAct = request.status === "pending_hr" && isHr;
  const canDecide = canManagerAct || canHrAct;
  const mine = request.submitted_by === session.userId;
  const canEdit = isOvertimeEditable(request.status) && (isHr || mine);
  const canCancel = CANCELLABLE_OVERTIME_STATUSES.includes(request.status) && (isHr || mine);
  const lines = request.overtime_request_employees ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMode("view");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {mode === "edit" ? "تعديل تكليف العمل الإضافي" : "تفاصيل تكليف العمل الإضافي"}
            <StatusBadge status={request.status} />
          </DialogTitle>
        </DialogHeader>

        {mode === "edit" ? (
          <OvertimeForm
            session={session}
            request={request}
            onDone={() => {
              setMode("view");
              onOpenChange(false);
            }}
            onCancel={() => setMode("view")}
          />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="تاريخ العمل" value={formatDate(request.work_date)} />
              <Field label="الإدارة" value={request.departments?.name ?? "—"} />
              <Field label="عدد الموظفين" value={String(lines.length)} />
              <Field label="مقدّم التكليف" value={mine ? "أنت" : (requesterName ?? "—")} />
              <Field label="تاريخ التقديم" value={formatDateTime(request.created_at)} />
            </div>

            <div className="rounded-xl border">
              <p className="border-b p-3 text-sm font-semibold">الموظفون والورديات</p>
              <ul className="divide-y">
                {lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 p-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {line.employees?.full_name ?? "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        كود: {line.employees?.employee_code ?? "—"}
                        {line.employees?.departments ? ` — ${line.employees.departments.name}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border bg-muted px-3 py-1 text-xs font-semibold">
                      {shiftLabel(line.shift_code)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">ملاحظات</p>
              <p className="text-sm">{request.notes?.trim() ? request.notes : "لا توجد ملاحظات"}</p>
            </div>

            <div className="rounded-xl border p-4">
              <p className="mb-3 text-sm font-semibold">مسار الاعتماد</p>
              <ol className="space-y-3 border-s ps-4">
                <li>
                  <p className="text-sm font-medium">تم تقديم التكليف</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(request.created_at)}</p>
                </li>
                <li>
                  <p className="text-sm font-medium">قرار المدير</p>
                  <p className="text-xs text-muted-foreground">
                    {request.manager_decided_at
                      ? formatDateTime(request.manager_decided_at)
                      : request.status === "pending_manager"
                        ? "بانتظار اعتماد المدير"
                        : "لا يتطلب اعتماد المدير"}
                  </p>
                </li>
                <li>
                  <p className="text-sm font-medium">قرار الإدارة</p>
                  <p className="text-xs text-muted-foreground">
                    {request.hr_decided_at
                      ? formatDateTime(request.hr_decided_at)
                      : request.status === "pending_hr"
                        ? "بانتظار اعتماد الإدارة"
                        : "—"}
                  </p>
                </li>
              </ol>
              {request.rejection_reason ? (
                <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  سبب الرفض: {request.rejection_reason}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              {canDecide ? (
                <>
                  <Button
                    size="lg"
                    className="h-12 text-base sm:flex-1"
                    onClick={() => setConfirmApprove(true)}
                  >
                    اعتماد التكليف
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    className="h-12 text-base sm:flex-1"
                    onClick={() => setRejectOpen(true)}
                  >
                    رفض التكليف
                  </Button>
                </>
              ) : null}
              {canEdit ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 text-base sm:flex-1"
                  onClick={() => setMode("edit")}
                >
                  {request.status === "rejected" ? "تعديل وإعادة التقديم" : "تعديل"}
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 text-base sm:flex-1"
                  onClick={() => setConfirmCancel(true)}
                >
                  إلغاء التكليف
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title="هل أنت متأكد من اعتماد تكليف العمل الإضافي؟"
        description={
          request.status === "pending_manager"
            ? "سينتقل التكليف بعد اعتمادك إلى الإدارة لاستكمال الاعتماد."
            : "سيتم اعتماد التكليف نهائيًا."
        }
        confirmLabel="اعتماد"
        pending={decide.isPending}
        onConfirm={() => decide.mutate({ action: "approve" })}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="هل أنت متأكد من إلغاء تكليف العمل الإضافي؟"
        confirmLabel="إلغاء التكليف"
        destructive
        pending={decide.isPending}
        onConfirm={() => decide.mutate({ action: "cancel" })}
      />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="رفض تكليف العمل الإضافي"
        description="يرجى إدخال سبب الرفض."
        pending={decide.isPending}
        onConfirm={(reason) => decide.mutate({ action: "reject", reason })}
      />
    </Dialog>
  );
}
