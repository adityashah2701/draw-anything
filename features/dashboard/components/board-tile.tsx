"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/features/dashboard/lib/format";
import { useBoardThumbnail } from "@/features/dashboard/hooks/use-board-thumbnail";
import WhiteboardMenu from "@/features/dashboard/components/whiteboard-dropdown";
import RenameDialog from "@/features/dashboard/dialogs/rename-dialog";
import DeleteDialog from "@/features/dashboard/dialogs/delete-dialog";
import { ImageUploadDialog } from "@/features/dashboard/dialogs/image-upload-dialog";

interface BoardTileProps {
  board: Doc<"whiteboards">;
  /** The "continue" layout: preview beside the details, with an explicit Open action. */
  featured?: boolean;
}

/** A whiteboard as a sheet: its preview on a dotted ground, captioned like a drawing title block. */
export function BoardTile({ board, featured = false }: BoardTileProps) {
  const { user } = useUser();
  const creator = useQuery(api.users.getById, { id: board.createdBy });
  const { mutate: removeBoard } = useApiMutation(api.whiteboard.remove);
  const { mutate: renameBoard } = useApiMutation(api.whiteboard.update);

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [title, setTitle] = useState(board.title);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  // A preview the user chose wins; otherwise draw the saved content.
  const drawn = useBoardThumbnail(board, !board.imageUrl, previewEl);
  const previewSrc = board.imageUrl || drawn;

  const href = `/whiteboard/${board._id}`;
  const mine = !!creator && user?.id === creator.clerkId;
  const creatorName = !creator ? null : mine ? "You" : creator.name || "Unknown";

  const copyLink = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void navigator.clipboard.writeText(`${window.location.origin}${href}`);
    toast.success("Link copied");
  };

  const handleRename = async () => {
    const next = title.trim();
    if (!next) return toast.error("A whiteboard needs a name");
    if (next === board.title) return setRenameOpen(false);
    setRenaming(true);
    try {
      await renameBoard({ id: board._id, title: next });
      toast.success("Renamed");
      setRenameOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename the whiteboard");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await removeBoard({ id });
      toast.success("Whiteboard deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the whiteboard");
    } finally {
      setDeleting(false);
    }
  };

  const preview = (
    <div
      ref={setPreviewEl}
      className={cn(
        "relative overflow-hidden rounded-lg border",
        previewSrc ? "bg-white" : "bg-sheet",
        featured ? "aspect-[16/9]" : "aspect-[4/3]",
        "transition-colors group-hover/tile:border-input",
      )}
    >
      {board.imageUrl ? (
        <Image src={board.imageUrl} alt="" fill sizes={featured ? "60vw" : "(min-width: 1280px) 22vw, 45vw"} className="object-contain" />
      ) : drawn ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob URL; next/image cannot optimise it
        <img src={drawn} alt="" className="absolute inset-0 size-full object-contain" />
      ) : (
        <span className="label-mono absolute bottom-2 left-2.5">{board.content ? "" : "Empty"}</span>
      )}
    </div>
  );

  const menu = (
    <WhiteboardMenu
      whiteboard={board}
      handleCopyLink={copyLink}
      openRenameDialog={() => {
        setTitle(board.title);
        setRenameOpen(true);
      }}
      openDeleteDialog={() => setDeleteOpen(true)}
      setIsImageUploadOpen={setImageOpen}
      trigger={
        <Button variant="ghost" size="icon" className="size-7 bg-card/90 hover:bg-card border" aria-label={`Actions for ${board.title}`}>
          <MoreHorizontal />
        </Button>
      }
    />
  );

  const dialogs = (
    <>
      <RenameDialog
        board={board}
        handleRename={handleRename}
        isRenameDialogOpen={renameOpen}
        isRenameLoading={renaming}
        newTitle={title}
        setIsRenameDialogOpen={setRenameOpen}
        setNewTitle={setTitle}
      />
      <DeleteDialog
        whiteboard={board}
        handleDelete={handleDelete}
        isDeleteDialogOpen={deleteOpen}
        setIsDeleteDialogOpen={setDeleteOpen}
        isDeleteLoading={deleting}
      />
      <ImageUploadDialog
        isOpen={imageOpen}
        onOpenChange={setImageOpen}
        whiteboardId={board._id}
        currentImageUrl={board.imageUrl || undefined}
        onSuccess={() => toast.success("Preview updated")}
      />
    </>
  );

  const created = (
    <span className="label-mono">
      Created {formatRelative(board._creationTime)}
      {creatorName ? ` · ${creatorName}` : ""}
    </span>
  );

  if (featured) {
    return (
      <article className="group/tile relative grid gap-5 md:grid-cols-5 md:gap-8">
        <Link href={href} className="md:col-span-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label={`Open ${board.title}`}>
          {preview}
        </Link>
        <div className="flex min-w-0 flex-col justify-end gap-4 md:col-span-2">
          <div className="min-w-0 space-y-2">
            <h2 className="text-2xl leading-tight font-semibold tracking-tight break-words">{board.title}</h2>
            {created}
            {board.tags && board.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {board.tags.slice(0, 4).map((tag) => (
                  <li key={tag} className="rounded-sm border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href={href}>Open whiteboard</Link>
            </Button>
            {menu}
          </div>
        </div>
        {dialogs}
      </article>
    );
  }

  return (
    <article className="group/tile relative">
      {preview}
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <h3 className="truncate text-[13px] leading-none font-medium">
            {/* The link spans the whole tile; the menu sits above it. */}
            <Link href={href} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background">
              {board.title}
            </Link>
          </h3>
          {created}
        </div>
        {creator && (
          <Avatar className="size-4 shrink-0">
            <AvatarImage src={creator.imageUrl} alt="" />
            <AvatarFallback className="text-[8px]">{(creator.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">
        {menu}
      </div>
      {dialogs}
    </article>
  );
}
