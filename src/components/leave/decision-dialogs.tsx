import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تأكيد",
  pending,
  onConfirm,
  destructive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row-reverse">
          <Button
            size="lg"
            className="h-12 w-full text-base sm:w-auto"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full text-base sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            تراجع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const invalid = touched && reason.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rejection-reason" className="text-base">
            سبب الرفض
          </Label>
          <Textarea
            id="rejection-reason"
            rows={3}
            className="text-base"
            placeholder="يرجى إدخال سبب الرفض."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {invalid ? <p className="text-sm text-destructive">يرجى إدخال سبب الرفض.</p> : null}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row-reverse">
          <Button
            size="lg"
            variant="destructive"
            className="h-12 w-full text-base sm:w-auto"
            disabled={pending}
            onClick={() => {
              setTouched(true);
              if (reason.trim().length === 0) return;
              onConfirm(reason.trim());
            }}
          >
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            تأكيد الرفض
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full text-base sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            تراجع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
