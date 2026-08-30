import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_TONE, type RequestStatus } from "@/lib/labels";

const TONE_CLASSES: Record<string, string> = {
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  info: "bg-info/15 text-info border-info/40",
  success: "bg-success/15 text-success border-success/40",
  destructive: "bg-destructive/12 text-destructive border-destructive/40",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[STATUS_TONE[status]],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        active ? TONE_CLASSES["success"] : TONE_CLASSES["muted"],
      )}
    >
      {active ? "نشط" : "غير نشط"}
    </span>
  );
}
