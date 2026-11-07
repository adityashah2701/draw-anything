import * as React from "react";
import { Check } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROLES,
  errorMessage,
  parseEmails,
  type TeamRole,
} from "../team-model";

export function InviteDialog({
  open,
  onOpenChange,
  roles,
  existingEmails,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: TeamRole[];
  existingEmails: string[];
  onInvite: (emails: string[], role: string) => Promise<void>;
}) {
  const defaultRole = (roles.find((r) => r.key === "org:member") ?? roles[roles.length - 1] ?? DEFAULT_ROLES[1]).key;
  const [text, setText] = React.useState("");
  const [role, setRole] = React.useState(defaultRole);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  // Start clean every time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setText("");
      setRole(defaultRole);
      setError(null);
    }
  }, [open, defaultRole]);

  const { valid, invalid } = parseEmails(text);
  const taken = new Set(existingEmails.map((e) => e.toLowerCase()));
  const fresh = valid.filter((e) => !taken.has(e.toLowerCase()));
  const already = valid.length - fresh.length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalid.length > 0) return setError(`${invalid.join(", ")} ${invalid.length === 1 ? "is not an email address" : "are not email addresses"}.`);
    if (fresh.length === 0) return setError(already > 0 ? "Everyone listed is already a member or invited." : "Enter at least one email address.");
    setBusy(true);
    setError(null);
    try {
      await onInvite(fresh, role);
      toast.success(fresh.length === 1 ? `Invitation sent to ${fresh[0]}` : `${fresh.length} invitations sent`);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "Could not send the invitations"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite people</DialogTitle>
            <DialogDescription>They get an email with a link to join this workspace.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={inputId}>Email addresses</Label>
            <textarea
              id={inputId}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              rows={3}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="ada@example.com, grace@example.com"
              aria-invalid={!!error}
              aria-describedby={`${inputId}-hint`}
              className="min-h-20 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/30 md:text-sm"
            />
            <p id={`${inputId}-hint`} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
              {error ?? "Separate several addresses with commas, spaces or new lines."}
            </p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">Role</legend>
            <div role="radiogroup" aria-label="Role" className="grid gap-2">
              {roles.map((r) => {
                const selected = role === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRole(r.key)}
                    className={cn(
                      "flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                      selected ? "border-primary bg-accent" : "border-input hover:bg-accent",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm leading-tight font-medium">{r.name}</span>
                      {r.description && <span className="mt-1 block text-xs text-muted-foreground">{r.description}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <DialogFooter className="items-center sm:justify-between">
            <p className="label-mono">{fresh.length > 0 ? `${fresh.length} ${fresh.length === 1 ? "person" : "people"}` : ""}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || text.trim() === ""}>
                {busy ? "Sending…" : fresh.length > 1 ? "Send invitations" : "Send invitation"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

