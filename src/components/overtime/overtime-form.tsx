import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import {
  OvertimeEmployeesPicker,
  type PickedEmployee,
} from "@/components/overtime/overtime-employees-picker";
import type { SessionInfo } from "@/hooks/use-session";
import {
  SHIFT_CODES,
  SHIFT_LABELS,
  overtimeErrorMessage,
  submitOvertimeRequest,
  updateOvertimeRequest,
  type OvertimeRequestRow,
  type ShiftCode,
} from "@/lib/overtime";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OvertimeForm({
  session,
  request,
  onDone,
  onCancel,
}: {
  session: SessionInfo;
  request?: OvertimeRequestRow;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = !!request;

  const [workDate, setWorkDate] = useState(request?.work_date ?? today());
  const [notes, setNotes] = useState(request?.notes ?? "");
  const [employees, setEmployees] = useState<PickedEmployee[]>(
    (request?.overtime_request_employees ?? []).map((line) => ({
      id: line.employee_id,
      employee_code: line.employees?.employee_code ?? "—",
      full_name: line.employees?.full_name ?? "—",
      departmentName: line.employees?.departments?.name ?? null,
    })),
  );
  const [shifts, setShifts] = useState<Record<string, ShiftCode>>(() => {
    const map: Record<string, ShiftCode> = {};
    for (const line of request?.overtime_request_employees ?? []) {
      map[line.employee_id] = (line.shift_code as ShiftCode) ?? "shift_1";
    }
    return map;
  });

  const missingShifts = useMemo(
    () => employees.filter((e) => !shifts[e.id]).length,
    [employees, shifts],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const items = employees.map((e) => ({
        employeeId: e.id,
        shiftCode: shifts[e.id] as ShiftCode,
      }));
      const payload = { workDate, notes: notes.trim(), items };
      if (editing) {
        await updateOvertimeRequest(request!.id, payload);
        return request!.id;
      }
      return submitOvertimeRequest(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث تكليف العمل الإضافي" : "تم تقديم تكليف العمل الإضافي");
      queryClient.invalidateQueries({ queryKey: ["overtime-requests"] });
      queryClient.invalidateQueries({ queryKey: ["overtime-counters"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onDone();
    },
    onError: (e) => toast.error(overtimeErrorMessage(e)),
  });

  function setEmployeesAndShifts(next: PickedEmployee[]) {
    setEmployees(next);
    setShifts((prev) => {
      const map: Record<string, ShiftCode> = {};
      for (const e of next) map[e.id] = prev[e.id] ?? "shift_1";
      return map;
    });
  }

  function applyShiftToAll(code: ShiftCode) {
    setShifts(Object.fromEntries(employees.map((e) => [e.id, code])) as Record<string, ShiftCode>);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!workDate) {
      toast.error("يرجى تحديد تاريخ العمل الإضافي");
      return;
    }
    if (employees.length === 0) {
      toast.error("يجب اختيار موظف واحد على الأقل");
      return;
    }
    if (missingShifts > 0) {
      toast.error("يرجى تحديد الوردية لكل موظف");
      return;
    }
    mutation.mutate();
  }
 if (!notes.trim()) {
    toast.error("يجب كتابة سبب تكليف العمل الإضافي");
    return;
  }
  mutation.mutate();
}
  
  const canSubmit = !!session.employee || session.roles.includes("hr");

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ot-date" className="text-sm">
          تاريخ العمل الإضافي
        </Label>
        <Input
          id="ot-date"
          type="date"
          className="h-12 text-base"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">الموظفون المكلَّفون</Label>
        <OvertimeEmployeesPicker selected={employees} onChange={setEmployeesAndShifts} />
        {employees.length > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">تعيين وردية واحدة للجميع:</span>
            <Select onValueChange={(v) => applyShiftToAll(v as ShiftCode)}>
              <SelectTrigger className="h-10 w-44" aria-label="تعيين الوردية للجميع">
                <SelectValue placeholder="اختر الوردية" />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_CODES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {SHIFT_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {employees.length > 0 ? (
        <ul className="divide-y rounded-xl border">
          {employees.map((e) => (
            <li key={e.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  كود: {e.employee_code}
                  {e.departmentName ? ` — ${e.departmentName}` : ""}
                </p>
              </div>
              <Select
                value={shifts[e.id] ?? ""}
                onValueChange={(v) => setShifts((prev) => ({ ...prev, [e.id]: v as ShiftCode }))}
              >
                <SelectTrigger
                  className="h-12 w-full text-base sm:w-48"
                  aria-label={`وردية ${e.full_name}`}
                >
                  <SelectValue placeholder="اختر الوردية" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_CODES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {SHIFT_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-12 shrink-0 text-destructive"
                aria-label={`إزالة ${e.full_name}`}
                onClick={() => setEmployeesAndShifts(employees.filter((x) => x.id !== e.id))}
              >
                <Trash2 className="size-5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

     <div className="space-y-2">
  <Label htmlFor="ot-notes" className="text-sm">
    سبب تكليف العمل الإضافي <span className="text-destructive">*</span>
  </Label>
  <Textarea
    id="ot-notes"
    className="min-h-24 text-base"
    value={notes}
    onChange={(e) => setNotes(e.target.value)}
    placeholder="برجاء كتابة سبب تكليف العمل الإضافي"
    required
  />
</div>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="submit"
          size="lg"
          className="h-12 text-base sm:flex-1"
          disabled={mutation.isPending || !canSubmit}
        >
          {editing ? "حفظ التعديلات" : "تقديم التكليف"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 text-base sm:flex-1"
            onClick={onCancel}
          >
            إلغاء
          </Button>
        ) : null}
      </div>

      {!canSubmit ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          حسابك غير مرتبط بملف موظف، لذلك لا يمكن تقديم تكليفات العمل الإضافي.
        </p>
      ) : null}
    </form>
  );
}
