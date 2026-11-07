import * as React from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/shared/section-label";
import { errorMessage, initials } from "../team-model";
import { ConfirmDialog } from "./confirm-dialog";
import type { TeamActions, TeamWorkspace } from "./team-types";

export function WorkspaceSection({
  workspace,
  canManage,
  actions,
}: {
  workspace: TeamWorkspace;
  canManage: boolean;
  actions: TeamActions;
}) {
  const [name, setName] = React.useState(workspace.name);
  const [saving, setSaving] = React.useState(false);
  const [logoBusy, setLogoBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const nameId = React.useId();

  React.useEffect(() => setName(workspace.name), [workspace.name]);

  const trimmed = name.trim();
  const dirty = trimmed !== workspace.name && trimmed !== "";

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      await actions.rename(trimmed);
      toast.success("Workspace renamed");
    } catch (error) {
      toast.error(errorMessage(error, "Could not rename the workspace"));
    } finally {
      setSaving(false);
    }
  };

  const changeLogo = async (file: File | null) => {
    setLogoBusy(true);
    try {
      await actions.setLogo(file);
      toast.success(file ? "Logo updated" : "Logo removed");
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the logo"));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section aria-labelledby="workspace-heading" className="space-y-4">
      <SectionLabel title={<span id="workspace-heading">Workspace</span>} />
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex items-center gap-3">
            <Avatar aria-hidden className="size-12 rounded-md">
              {workspace.hasImage && workspace.imageUrl && <AvatarImage src={workspace.imageUrl} alt="" />}
              <AvatarFallback className="rounded-md bg-muted font-mono text-sm font-semibold text-muted-foreground">{initials(workspace.name)}</AvatarFallback>
            </Avatar>
            {canManage && (
              <div className="flex flex-col items-start gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Workspace logo file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void changeLogo(file);
                  }}
                />
                <Button variant="outline" size="sm" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
                  {logoBusy ? "Uploading…" : workspace.hasImage ? "Change logo" : "Upload logo"}
                </Button>
                {workspace.hasImage && !logoBusy && (
                  <button type="button" onClick={() => changeLogo(null)} className="rounded-xs text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={save} className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={nameId}>Name</Label>
            <div className="flex gap-2">
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} readOnly={!canManage} maxLength={100} className="min-w-0 flex-1" />
              {canManage && (
                <Button type="submit" variant="secondary" disabled={!dirty || saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Leave workspace</p>
            <p className="mt-1 text-xs text-muted-foreground">You lose access to its whiteboards until someone invites you back.</p>
          </div>
          <Button variant="outline" onClick={() => setLeaving(true)} className="text-destructive hover:text-destructive">
            Leave
          </Button>
        </div>

        {canManage && actions.deleteWorkspace && (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Delete workspace</p>
              <p className="mt-1 text-xs text-muted-foreground">Removes the workspace and everyone’s access to it. This cannot be undone.</p>
            </div>
            <Button variant="outline" onClick={() => setDeleting(true)} className="text-destructive hover:text-destructive">
              Delete
            </Button>
          </div>
        )}
      </div>

      {actions.openAdvanced && (
        <p className="text-xs text-muted-foreground">
          Verified domains and join requests are managed in{" "}
          <button type="button" onClick={actions.openAdvanced} className="rounded-xs underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            advanced settings
          </button>
          .
        </p>
      )}

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${workspace.name}?`}
        description="You will lose access to its whiteboards until an admin invites you back."
        confirmLabel="Leave workspace"
        onConfirm={actions.leave}
        failureMessage="Could not leave the workspace"
      />
      {actions.deleteWorkspace && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${workspace.name}?`}
          description="Everyone loses access to it. This cannot be undone."
          confirmLabel="Delete workspace"
          requireText={workspace.name}
          onConfirm={actions.deleteWorkspace}
          failureMessage="Could not delete the workspace"
        />
      )}
    </section>
  );
}

