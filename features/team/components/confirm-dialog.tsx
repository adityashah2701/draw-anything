import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "../team-model";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requireText,
  onConfirm,
  successMessage,
  failureMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** When set, the action stays disabled until this text is typed. */
  requireText?: string;
  onConfirm: () => Promise<void>;
  successMessage?: string;
  failureMessage: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const id = React.useId();
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      if (successMessage) toast.success(successMessage);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, failureMessage));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireText && (
          <div className="grid gap-2">
            <Label htmlFor={id}>
              Type <span className="font-mono">{requireText}</span> to confirm
            </Label>
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy || (!!requireText && typed !== requireText)}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

