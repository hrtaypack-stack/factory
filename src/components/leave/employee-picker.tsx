import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/states";
import { fetchSelectableEmployees } from "@/lib/leave";
import { cn } from "@/lib/utils";

export interface PickableEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  departments: { id: string; name: string } | null;
}

/**
 * Mobile-first searchable employee selector.
 * The list only ever contains employees the signed-in user is allowed to see
 * (enforced by RLS), and the database re-checks scope on submit.
 */
export function EmployeePicker({
  value,
  onChange,
  excludeId,
}: {
  value: PickableEmployee | null;
  onChange: (employee: PickableEmployee) => void;
  excludeId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const query = useQuery({
    queryKey: ["selectable-employees", term],
    queryFn: () => fetchSelectableEmployees(term),
    enabled: open,
  });

  const rows = (query.data ?? []).filter((e) => e.id !== excludeId) as PickableEmployee[];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-14 w-full justify-between gap-2 px-4 text-start"
        onClick={() => setOpen(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            {value ? (
              <>
                <span className="block truncate text-base font-semibold">{value.full_name}</span>
                <span className="block text-xs text-muted-foreground">
                  كود: {value.employee_code}
                  {value.departments ? ` — ${value.departments.name}` : ""}
                </span>
              </>
            ) : (
              <span className="text-base text-muted-foreground">اختر الموظف</span>
            )}
          </span>
        </span>
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] gap-3 overflow-hidden p-4 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>اختر الموظف</DialogTitle>
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
          <div className="max-h-[55vh] overflow-y-auto">
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
                {rows.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(e);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-1 py-3 text-start hover:bg-accent",
                        value?.id === e.id && "bg-accent",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{e.full_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          كود: {e.employee_code}
                          {e.departments ? ` — ${e.departments.name}` : ""}
                        </span>
                      </span>
                      {value?.id === e.id ? (
                        <Check className="size-5 shrink-0 text-primary" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
