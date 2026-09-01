import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/states";
import { fetchSelectableEmployees } from "@/lib/leave";

export interface PickedEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  departmentName: string | null;
}

/**
 * Mobile-first multi-select employee picker.
 * The list only contains employees the signed-in user may assign (RLS),
 * and the database re-checks scope on submit.
 */
export function OvertimeEmployeesPicker({
  selected,
  onChange,
}: {
  selected: PickedEmployee[];
  onChange: (next: PickedEmployee[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const query = useQuery({
    queryKey: ["selectable-employees", term],
    queryFn: () => fetchSelectableEmployees(term),
    enabled: open,
  });

  const rows = query.data ?? [];

  function toggle(row: (typeof rows)[number]) {
    const exists = selected.some((s) => s.id === row.id);
    if (exists) {
      onChange(selected.filter((s) => s.id !== row.id));
    } else {
      onChange([
        ...selected,
        {
          id: row.id,
          employee_code: row.employee_code,
          full_name: row.full_name,
          departmentName: row.departments?.name ?? null,
        },
      ]);
    }
  }

  function addAllVisible() {
    const map = new Map(selected.map((s) => [s.id, s]));
    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, {
          id: row.id,
          employee_code: row.employee_code,
          full_name: row.full_name,
          departmentName: row.departments?.name ?? null,
        });
      }
    }
    onChange([...map.values()]);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-14 w-full justify-between gap-2 px-4 text-start"
        onClick={() => setOpen(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <UsersRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-base">
            {selected.length > 0 ? `تم اختيار ${selected.length} موظف` : "اختر الموظفين"}
          </span>
        </span>
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] gap-3 overflow-hidden p-4 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>اختر الموظفين</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              className="h-12 pe-11 text-base"
              placeholder="ابحث بكود الموظف أو الاسم"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="بحث الموظفين"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            {query.isPending ? (
              <LoadingState />
            ) : query.isError ? (
              <ErrorState onRetry={() => query.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState
                title="لا يوجد موظفون مطابقون للبحث"
                description="يمكنك اختيار الموظفين التابعين لك فقط."
              />
            ) : (
              <ul className="divide-y">
                {rows.map((e) => {
                  const checked = selected.some((s) => s.id === e.id);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => toggle(e)}
                        className="flex w-full items-center gap-3 px-1 py-3 text-start hover:bg-accent"
                      >
                        <Checkbox checked={checked} aria-label="تحديد الموظف" className="pointer-events-none" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{e.full_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            كود: {e.employee_code}
                            {e.departments ? ` — ${e.departments.name}` : ""}
                          </span>
                        </span>
                        {checked ? <Check className="size-5 shrink-0 text-primary" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={addAllVisible}>
              إضافة كل النتائج
            </Button>
            <Button type="button" className="h-12 flex-1" onClick={() => setOpen(false)}>
              تم ({selected.length})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
