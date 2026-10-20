import { EmptySheet } from "@/components/shared/empty-sheet";
import { PendingWorkspaces } from "@/features/invitations/components/pending-workspaces";

/** Shown when no workspace is selected. Creating or joining one happens in the sidebar switcher. */
const NoOrganizationState = () => (
  <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-8">
    <PendingWorkspaces showEmpty />
    <EmptySheet
      title="Pick a workspace"
      description="Whiteboards live in a workspace so your team can share them. Use the workspace switcher at the bottom of the sidebar to create one or join an existing one."
    />
  </div>
);

export default NoOrganizationState;
