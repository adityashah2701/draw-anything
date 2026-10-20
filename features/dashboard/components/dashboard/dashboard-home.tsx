import { ArrowRight, Plus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Doc } from "@/convex/_generated/dataModel";
import { EmptySheet } from "@/components/shared/empty-sheet";
import { SectionLabel } from "@/components/shared/section-label";
import { BoardTile } from "@/features/dashboard/components/board-tile";

const RECENT_LIMIT = 8;

interface DashboardHomeProps {
  organizationName: string;
  membersCount?: number;
  /** Newest first. */
  boards: Doc<"whiteboards">[];
  isCreating: boolean;
  onCreate: () => void;
  onInvite: () => void;
  onShowAll: () => void;
}

/**
 * The home screen answers one question: what do I open next? The newest whiteboard leads, the next
 * few follow, and everything else is one step away. It shows only what the workspace actually holds.
 */
export function DashboardHome({ organizationName, membersCount, boards, isCreating, onCreate, onInvite, onShowAll }: DashboardHomeProps) {
  const [latest, ...rest] = boards;
  const recent = rest.slice(0, RECENT_LIMIT);

  const summary = [
    `${boards.length} ${boards.length === 1 ? "whiteboard" : "whiteboards"}`,
    typeof membersCount === "number" ? `${membersCount} ${membersCount === 1 ? "member" : "members"}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{organizationName}</h1>
          <p className="label-mono">{summary.join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onInvite}>
            <UserPlus /> Invite people
          </Button>
          {latest && (
            <Button onClick={onCreate} disabled={isCreating}>
              <Plus /> {isCreating ? "Creating…" : "New whiteboard"}
            </Button>
          )}
        </div>
      </header>

      {!latest ? (
        <EmptySheet
          title="A blank sheet"
          description="Draw shapes and connectors yourself, or open the AI agent inside a whiteboard and describe the diagram you want."
        >
          <Button onClick={onCreate} disabled={isCreating}>
            <Plus /> New whiteboard
          </Button>
        </EmptySheet>
      ) : (
        <>
          <section aria-labelledby="continue-heading" className="space-y-4">
            <SectionLabel title={<span id="continue-heading">Continue</span>} />
            <BoardTile board={latest} featured />
          </section>

          {recent.length > 0 && (
            <section aria-labelledby="recent-heading" className="space-y-5">
              <SectionLabel
                title={<span id="recent-heading">Recent</span>}
                action={
                  <Button variant="ghost" size="sm" className="-my-1.5 h-7 px-2 text-xs" onClick={onShowAll}>
                    All whiteboards <ArrowRight />
                  </Button>
                }
              />
              <ul className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
                {recent.map((board) => (
                  <li key={board._id}>
                    <BoardTile board={board} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-8 sm:py-10" aria-busy="true" aria-label="Loading whiteboards">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-3 w-36 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-8 md:grid-cols-5">
        <div className="aspect-[16/10] animate-pulse rounded-lg bg-muted md:col-span-3" />
        <div className="space-y-3 self-end md:col-span-2">
          <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2.5">
            <div className="aspect-[4/3] animate-pulse rounded-lg bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
