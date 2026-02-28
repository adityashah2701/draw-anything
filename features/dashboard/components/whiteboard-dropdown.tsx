import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Copy, Eye, MoreVertical, Pencil, Trash, Upload } from "lucide-react";
import Link from "next/link";

interface Props {
  whiteboard: any;
  handleCopyLink: any;
  setIsImageUploadOpen: any;
  openRenameDialog: () => void;
  openDeleteDialog: () => void;
}

const WhiteboardDropdown = ({
  whiteboard,
  handleCopyLink,
  openDeleteDialog,
  openRenameDialog,
  setIsImageUploadOpen,
}: Props) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 bg-white/80 hover:bg-white border border-gray-200 shadow-sm cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link
            href={`/whiteboard/${whiteboard._id}`}
            className="cursor-pointer"
          >
            <Eye className="w-4 h-4 mr-2" />
            Open
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <button
            onClick={(e) => {
              handleCopyLink(e, whiteboard._id);
            }}
            className="w-full cursor-pointer justify-start border-none outline-none p-0"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <button
            onClick={() => setIsImageUploadOpen(true)}
            className="w-full cursor-pointer justify-start border-none outline-none p-0"
          >
            <Upload className="w-4 h-4 mr-2" />
            Edit Image
          </button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <button
            onClick={(e) => {
              openRenameDialog();
            }}
            className="w-full cursor-pointer justify-start border-none outline-none p-0"
          >
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </button>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive">
          <button
            onClick={() => {
              openDeleteDialog();
            }}
            className="w-full cursor-pointer justify-start border-none outline-none p-0"
          >
            <Trash className="w-4 h-4 mr-2" />
            Delete
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WhiteboardDropdown;
