import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeePicker, type PickableEmployee } from "@/components/leave/employee-picker";
import { ErrorState, LoadingState } from "@/components/common/states";
import type { SessionInfo } from "@/hooks/use-session";
import {
  calcLeaveDays,
  fetchLeaveTypes,
  leaveErrorMessage,
  submitLeaveRequest,
  updateLeaveRequest,
  type LeaveRequestRow,
} from "@/lib/leave";

interface Props {
  session: SessionInfo;
  /** when provided the form edits an existing request */
  request?: LeaveRequestRow;
  onDone: () => void;
  onCancel?: () => void;
}

export function LeaveForm({ session, request, onDone, onCancel }: Props) {
  const editing = !!request;
  const queryClient = useQueryClient();
  const canPickEmployee = !editing && session.role !== "employee";

  const selfEmployee: PickableEmployee | null = session.employee
    ? {
        id: session.employee.id,
        employee_code: session.employee.employee_code,
        full_name: session.employee.full_name,
        departments: null,
      }
    : null;

  const [employee, setEmployee] = useState<PickableEmployee | null>(
    editing && request?.employee
      ? {
          id: request.employee.id,
          employee_code: request.employee.employee_code,
          full_name: request.employee.full_name,
          departments: request.employee.departments,
        }
      : selfEmployee,
  );
  const [leaveTypeId, setLeaveTypeId] = useState(request?.leave_type_id ?? "");
  const [startDate, setStartDate] = useState(request?.start_date ?? "");
  const [endDate, setEndDate] = useState(request?.end_date ?? "");
  const [reason, setReason] = useState(request?.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  const leaveTypes = useQuery({ queryKey: ["leave-types", "active"], queryFn: () => fetchLeaveTypes(true) });

  const days = useMemo(() => calcLeaveDays(startDate, endDate), [startDate, endDate]);
  const invalidRange = !!startDate && !!endDate && days === 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (editing && request) {
        await updateLeaveRequest(request.id, { leaveTypeId, startDate, endDate, reason });
        return;
      }
      if (!employee) throw new Error("employee_not_found");
      await submitLeaveRequest({ employeeId: employee.id, leaveTypeId, startDate, endDate, reason });
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث طلب الإجازة" : "تم إرسال طلب الإجازة بنجاح");
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-counters"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onDone();
    },
    onError: (e) => {
      const message = leaveErrorMessage(e);
      setError(message);
      toast.error(message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!employee) return setError("يرجى اختيار الموظف");
    if (!leaveTypeId) return setError("يرجى اختيار نوع الإجازة");
    if (!startDate || !endDate) return setError("يرجى تحديد تاريخ البداية والنهاية");
    if (invalidRange) return setError("تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية");
    mutation.mutate();
  }

  if (leaveTypes.isPending) return <LoadingState />;
  if (leaveTypes.isError) return <ErrorState onRetry={() => leaveTypes.refetch()} />;

  if (!editing && !canPickEmployee && !session.employee) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        حسابك غير مرتبط بملف موظف، لذلك لا يمكن تقديم طلب إجازة. يرجى التواصل مع الموارد البشرية.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label className="text-base">الموظف</Label>
        {canPickEmployee ? (
          <EmployeePicker value={employee} onChange={setEmployee} />
        ) : (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="truncate text-base font-semibold">{employee?.full_name ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              كود الموظف: {employee?.employee_code ?? "—"}
              {employee?.departments ? ` — ${employee.departments.name}` : ""}
            </p>
          </div>
        )}
        {canPickEmployee ? (
          <p className="text-xs text-muted-foreground">
            تظهر لك فقط الموظفون التابعون لك، ويتم التحقق من ذلك مرة أخرى على مستوى قاعدة البيانات.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-base" htmlFor="leave-type">
          نوع الإجازة
        </Label>
        <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
          <SelectTrigger id="leave-type" className="h-14 text-base">
            <SelectValue placeholder="اختر نوع الإجازة" />
          </SelectTrigger>
          <SelectContent>
            {leaveTypes.data.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-base">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-base" htmlFor="start-date">
            تاريخ البداية
          </Label>
          <Input
            id="start-date"
            type="date"
            className="h-14 text-base"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate && e.target.value && endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-base" htmlFor="end-date">
            تاريخ النهاية
          </Label>
          <Input
            id="end-date"
            type="date"
            className="h-14 text-base"
            min={startDate || undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border bg-primary/5 p-4">
        <CalendarDays className="size-6 text-primary" aria-hidden />
        <div>
          <p className="text-sm text-muted-foreground">عدد الأيام (محسوب تلقائيًا)</p>
          <p className="text-2xl font-bold tabular-nums">{days}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-base" htmlFor="reason">
          ملاحظات (اختياري)
        </Label>
        <Textarea
          id="reason"
          rows={3}
          className="text-base"
          placeholder="أي تفاصيل إضافية تخص الطلب"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" size="lg" className="h-14 flex-1 text-base" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {editing ? "حفظ التعديلات" : "إرسال الطلب"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-14 text-base sm:flex-1"
            onClick={onCancel}
          >
            إلغاء
          </Button>
        ) : null}
      </div>

      {editing ? (
        <p className="text-xs text-muted-foreground">
          تعديل التواريخ أو نوع الإجازة يعيد الطلب إلى بداية مسار الاعتماد المطلوب.
        </p>
      ) : null}
    </form>
  );
}
