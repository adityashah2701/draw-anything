"use client";
import React, { useMemo, useState } from "react";
import { CreateOrganization, useOrganization, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptySheet } from "@/components/shared/empty-sheet";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useApiQuery } from "@/hooks/use-api-query";
import { ClerkDialog } from "../../dialogs/custom-dialog";
import { BoardTile } from "../board-tile";
import { DashboardSkeleton } from "../dashboard/dashboard-home";
import WhiteboardEmptyState from "./whiteboard-empty-state";

const Whiteboard = () => {
  const router = useRouter();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user, isLoaded: userLoaded } = useUser();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: whiteboards = [], isPending: queryPending } = useApiQuery(
    api.whiteboard.getAll,
    organization?.id ? { orgId: organization.id } : "skip",
  );
  const { mutate, isPending: creating } = useApiMutation(api.whiteboard.create);

  const boards = useMemo(() => {
    const all = [...(whiteboards as Doc<"whiteboards">[])].sort((a, b) => b._creationTime - a._creationTime);
    const needle = search.trim().toLowerCase();
    return needle ? all.filter((b) => b.title.toLowerCase().includes(needle)) : all;
  }, [whiteboards, search]);

  const handleCreate = async () => {
    if (!organization) return toast.error("Please select a workspace first.");
    try {
      await mutate({ title: "Untitled", orgId: organization.id });
    } catch {
      toast.error("Could not create the whiteboard");
    }
  };

  const frame = (children: React.ReactNode) => (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-8 sm:py-10">{children}</div>
  );

  if (!orgLoaded || !userLoaded) {
    return frame(<p className="label-mono" role="status">Loading…</p>);
  }

  if (!user) {
    return frame(
      <EmptySheet title="Sign in to see your whiteboards" description="Whiteboards belong to a workspace, so you need an account to open them.">
        <Button onClick={() => router.push("/sign-in")}>Sign in</Button>
      </EmptySheet>,
    );
  }

  if (!organization) {
    return frame(
      <EmptySheet
        title="Pick a workspace"
        description="Whiteboards live in a workspace so your team can share them. Create one, or join an existing one from the switcher in the sidebar."
      >
        <ClerkDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          trigger={
            <Button>
              <Plus /> Create workspace
            </Button>
          }
        >
          <CreateOrganization
            appearance={{ elements: { cardBox: { height: "100%", width: "100%", overflow: "hidden" }, rootBox: { height: "100%", width: "100%" } } }}
          />
        </ClerkDialog>
      </EmptySheet>,
    );
  }

  if (queryPending) return <DashboardSkeleton />;

  const total = (whiteboards as Doc<"whiteboards">[]).length;

  return frame(
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Whiteboards</h1>
          <p className="label-mono">{organization.name} · {total}</p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name"
                aria-label="Search whiteboards"
                className="h-9 w-48 pl-8 sm:w-56"
              />
            </div>
          )}
          <Button onClick={handleCreate} disabled={creating}>
            <Plus /> {creating ? "Creating…" : "New whiteboard"}
          </Button>
        </div>
      </header>

      {total === 0 ? (
        <WhiteboardEmptyState type="no-whiteboards" onCreateNew={handleCreate} />
      ) : boards.length === 0 ? (
        <WhiteboardEmptyState type="no-results" searchQuery={search.trim()} onClearFilters={() => setSearch("")} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((board) => (
            <li key={board._id}>
              <BoardTile board={board} />
            </li>
          ))}
        </ul>
      )}
    </>,
  );
};

export default Whiteboard;
