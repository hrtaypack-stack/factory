import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, type RequestStatus } from "@/lib/labels";
import { fetchDepartments, fetchSupervisorsAndManagers } from "@/lib/leave";
import {
  EMPTY_OVERTIME_FILTERS,
  SHIFT_CODES,
  SHIFT_LABELS,
  type OvertimeFilters,
} from "@/lib/overtime";

const STATUSES: RequestStatus[] = ["pending_manager", "pending_hr", "approved", "rejected", "cancelled"];

export function OvertimeFiltersBar({
  value,
  onChange,
  showOrgFilters = false,
}: {
  value: OvertimeFilters;
  onChange: (next: OvertimeFilters) => void;
  showOrgFilters?: boolean;
}) {
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments,
    enabled: showOrgFilters,
  });
  const people = useQuery({
    queryKey: ["org-people"],
    queryFn: fetchSupervisorsAndManagers,
    enabled: showOrgFilters,
  });

  const set = (patch: Partial<OvertimeFilters>) => onChange({ ...value, ...patch });
  const dirty = JSON.stringify(value) !== JSON.stringify(EMPTY_OVERTIME_FILTERS);

  return (
    <div className="surface-card space-y-3 p-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="h-12 pe-11 text-base"
          placeholder="ابحث بكود الموظف أو الاسم"
          value={value.term}
          onChange={(e) => set({ term: e.target.value })}
          aria-label="بحث التكليفات"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Select value={value.status} onValueChange={(v) => set({ status: v })}>
          <SelectTrigger className="h-12 text-base" aria-label="تصفية حسب الحالة">
            <SelectValue placeholder="جميع الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.shift} onValueChange={(v) => set({ shift: v })}>
          <SelectTrigger className="h-12 text-base" aria-label="تصفية حسب الوردية">
            <SelectValue placeholder="جميع الورديات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الورديات</SelectItem>
            {SHIFT_CODES.map((c) => (
              <SelectItem key={c} value={c}>
                {SHIFT_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showOrgFilters ? (
          <>
            <Select value={value.departmentId} onValueChange={(v) => set({ departmentId: v })}>
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

            <Select value={value.supervisorId} onValueChange={(v) => set({ supervisorId: v })}>
              <SelectTrigger className="h-12 text-base" aria-label="تصفية حسب المشرف">
                <SelectValue placeholder="جميع المشرفين" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المشرفين</SelectItem>
                {(people.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} ({p.employee_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={value.managerId} onValueChange={(v) => set({ managerId: v })}>
              <SelectTrigger className="h-12 text-base" aria-label="تصفية حسب المدير">
                <SelectValue placeholder="جميع المديرين" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المديرين</SelectItem>
                {(people.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} ({p.employee_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground" htmlFor="ot-filter-from">
            من تاريخ
          </Label>
          <Input
            id="ot-filter-from"
            type="date"
            className="h-12 text-base"
            value={value.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground" htmlFor="ot-filter-to">
            إلى تاريخ
          </Label>
          <Input
            id="ot-filter-to"
            type="date"
            className="h-12 text-base"
            value={value.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
      </div>

      {dirty ? (
        <Button variant="outline" size="lg" className="h-11" onClick={() => onChange(EMPTY_OVERTIME_FILTERS)}>
          <X className="size-4" aria-hidden />
          مسح عوامل التصفية
        </Button>
      ) : null}
    </div>
  );
}
