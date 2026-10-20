import React from "react";
import Link from "next/link";
import { Copy, ImageIcon, MoreHorizontal, Pencil, SquareArrowOutUpRight, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface Props {
  whiteboard: { _id: string; title: string };
  handleCopyLink: (e: React.SyntheticEvent, id: string) => void;
  setIsImageUploadOpen: (open: boolean) => void;
  openRenameDialog: () => void;
  openDeleteDialog: () => void;
  /** Replaces the default "more" button. Must be a single element. */
  trigger?: React.ReactElement;
}

/** The actions on a whiteboard, shared by the dashboard and the whiteboards list. */
const WhiteboardMenu = ({
  whiteboard,
  handleCopyLink,
  openDeleteDialog,
  openRenameDialog,
  setIsImageUploadOpen,
  trigger,
}: Props) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      {trigger ?? (
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${whiteboard.title}`}>
          <MoreHorizontal />
        </Button>
      )}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuItem asChild>
        <Link href={`/whiteboard/${whiteboard._id}`}>
          <SquareArrowOutUpRight /> Open
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={(e) => handleCopyLink(e as unknown as React.SyntheticEvent, whiteboard._id)}>
        <Copy /> Copy link
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={openRenameDialog}>
        <Pencil /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setIsImageUploadOpen(true)}>
        <ImageIcon /> Change preview
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={openDeleteDialog}>
        <Trash2 /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default WhiteboardMenu;
