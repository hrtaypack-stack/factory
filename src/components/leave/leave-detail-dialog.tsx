import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog, ReasonDialog } from "@/components/leave/decision-dialogs";
import { LeaveForm } from "@/components/leave/leave-form";
import type { SessionInfo } from "@/hooks/use-session";
import {
  decideLeaveRequests,
  fetchEmployeeChain,
  formatDate,
  formatDateTime,
  isEditable,
  leaveErrorMessage,
  type LeaveRequestRow,
} from "@/lib/leave";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  );
}

export function LeaveDetailDialog({
  request,
  session,
  requesterName,
  open,
  onOpenChange,
}: {
  request: LeaveRequestRow | null;
  session: SessionInfo;
  requesterName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const chain = useQuery({
    queryKey: ["employee-chain", request?.employee?.id],
    queryFn: () => fetchEmployeeChain(request?.employee ?? null),
    enabled: open && !!request?.employee,
  });

  const decide = useMutation({
    mutationFn: (args: { action: "approve" | "reject" | "cancel"; reason?: string }) =>
      decideLeaveRequests([request!.id], args.action, args.reason),
    onSuccess: (_count, args) => {
      toast.success(
        args.action === "approve"
          ? "تم اعتماد طلب الإجازة"
          : args.action === "reject"
            ? "تم رفض طلب الإجازة"
            : "تم إلغاء طلب الإجازة",
      );
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-counters"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setConfirmApprove(false);
      setConfirmCancel(false);
      setRejectOpen(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(leaveErrorMessage(e)),
  });

  if (!request) return null;

  const isHr = session.roles.includes("hr");
  const myEmployeeId = session.employee?.id ?? null;
  const canManagerAct =
    request.status === "pending_manager" &&
    (isHr || (!!request.manager_id && request.manager_id === myEmployeeId));
  const canHrAct = request.status === "pending_hr" && isHr;
  const canDecide = canManagerAct || canHrAct;
  const mine = request.submitted_by === session.userId;
  const canEdit = isEditable(request.status) && (isHr || mine);
  const canCancel = canEdit;

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
            {mode === "edit" ? "تعديل طلب الإجازة" : "تفاصيل طلب الإجازة"}
            <StatusBadge status={request.status} />
          </DialogTitle>
        </DialogHeader>

        {mode === "edit" ? (
          <LeaveForm
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
              <Field label="الموظف" value={request.employee?.full_name ?? "—"} />
              <Field label="كود الموظف" value={request.employee?.employee_code ?? "—"} />
              <Field label="الإدارة" value={request.employee?.departments?.name ?? "—"} />
              <Field
                label="المشرف"
                value={
                  request.employee?.supervisor_id
                    ? (chain.data?.[request.employee.supervisor_id] ?? "—")
                    : "—"
                }
              />
              <Field
                label="المدير"
                value={
                  request.employee?.manager_id ? (chain.data?.[request.employee.manager_id] ?? "—") : "—"
                }
              />
              <Field label="نوع الإجازة" value={request.leave_types?.name ?? "—"} />
              <Field label="تاريخ البداية" value={formatDate(request.start_date)} />
              <Field label="تاريخ النهاية" value={formatDate(request.end_date)} />
              <Field label="عدد الأيام" value={String(request.days_count)} />
              <Field
                label="مقدّم الطلب"
                value={mine ? "أنت" : (requesterName ?? "—")}
              />
              <Field label="تاريخ التقديم" value={formatDateTime(request.created_at)} />
            </div>

            <div>
              <p className="text-xs text-muted-foreground">ملاحظات</p>
              <p className="text-sm">{request.reason?.trim() ? request.reason : "لا توجد ملاحظات"}</p>
            </div>

            <div className="rounded-xl border p-4">
              <p className="mb-3 text-sm font-semibold">مسار الاعتماد</p>
              <ol className="space-y-3 border-s ps-4">
                <li>
                  <p className="text-sm font-medium">تم تقديم الطلب</p>
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
                    اعتماد الطلب
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    className="h-12 text-base sm:flex-1"
                    onClick={() => setRejectOpen(true)}
                  >
                    رفض الطلب
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
                  تعديل
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 text-base sm:flex-1"
                  onClick={() => setConfirmCancel(true)}
                >
                  إلغاء الطلب
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title="هل أنت متأكد من اعتماد طلب الإجازة؟"
        description={
          request.status === "pending_manager"
            ? "سينتقل الطلب بعد اعتمادك إلى الإدارة لاستكمال الاعتماد."
            : "سيتم اعتماد الطلب نهائيًا."
        }
        confirmLabel="اعتماد"
        pending={decide.isPending}
        onConfirm={() => decide.mutate({ action: "approve" })}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="هل أنت متأكد من إلغاء طلب الإجازة؟"
        confirmLabel="إلغاء الطلب"
        destructive
        pending={decide.isPending}
        onConfirm={() => decide.mutate({ action: "cancel" })}
      />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="رفض طلب الإجازة"
        description="يرجى إدخال سبب الرفض."
        pending={decide.isPending}
        onConfirm={(reason) => decide.mutate({ action: "reject", reason })}
      />
    </Dialog>
  );
}
