import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MoreVertical,
  Clock,
  Edit3,
  Trash2,
  Copy,
  Folder,
  User,
  Upload,
  Pencil,
} from "lucide-react";

// Simple loading spinner component
const LoadingSpinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <div
    className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin`}
  />
);

// Simple skeleton loader component
const SkeletonLoader = ({ className = "" }: { className?: string }) => (
  <div className={`bg-gray-200 animate-pulse rounded ${className}`} />
);
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useState } from "react";
import RenameDialog from "@/features/dashboard/dialogs/rename-dialog";
import { Borel } from "next/font/google";
import DeleteDialog from "@/features/dashboard/dialogs/delete-dialog";
import { ImageUploadDialog } from "@/features/dashboard/dialogs/image-upload-dialog";
import WhiteboardDropdown from "@/features/dashboard/components/whiteboard-dropdown";

const WhiteboardCard = ({ board }: { board: any }) => {
  const { user } = useUser();
  const creator = useQuery(api.users.getById, { id: board.createdBy });
  const { mutate, isPending } = useApiMutation(api.whiteboard.remove);
  const { mutate: renameMutate } = useApiMutation(api.whiteboard.update);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(board.title);
  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return "Yesterday";
    return date.toLocaleDateString();
  };
  const isCreatedByCurrentUser = user?.id === creator?.clerkId;

  const getCreatorName = () => {
    if (!creator) return "Loading...";
    if (isCreatedByCurrentUser) return "You";
    return creator.name || "Unknown User";
  };
  const getCreatorAvatar = () => {
    if (!creator) return { imageUrl: "", initials: "?" };

    return {
      imageUrl: creator.imageUrl,
      initials: creator.name ? creator.name.charAt(0).toUpperCase() : "U",
    };
  };
  const creatorAvatar = getCreatorAvatar();

  const handleCopyLink = (e: any, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const link = `${window.location.origin}/whiteboard/${id}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard!");
  };

  const handleDelete = async (id: string) => {
    try {
      setIsDeleteLoading(true);
      const whiteboard = await mutate({ id });
      toast.success("Whiteboard deleted successfully.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDeleteLoading(false);
    }
  };

  const handleRename = async () => {
    if (newTitle.trim() === "") {
      toast.error("Whiteboard name cannot be empty");
      return;
    }
    if (newTitle.trim() === board.title) {
      setIsRenameDialogOpen(false);
      return;
    }
    setIsRenameLoading(true);

    try {
      await renameMutate({ id: board._id, title: newTitle.trim() });
      toast.success("Whiteboard renamed successfully!");
      setIsRenameDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to rename whiteboard");
    } finally {
      setIsRenameLoading(false);
    }
  };

  const openRenameDialog = () => {
    setNewTitle(board.title);
    setIsRenameDialogOpen(true);
  };
  const openDeleteDialog = () => {
    setIsDeleteDialogOpen(true);
  };

  return (
    <div
      className={`group bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-200 overflow-hidden ${isPending ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* Thumbnail */}
      <div className="relative h-48 bg-gradient-to-br from-blue-50 to-purple-50 border-b border-gray-200">
        {/* Show preview image if available, otherwise show placeholder */}
        {board.imageUrl ? (
          <img
            src={board.imageUrl}
            alt={board.title}
            className="w-full h-full"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-white/80 rounded-full flex items-center justify-center">
              <Edit3 className="w-8 h-8 text-gray-400" />
            </div>
          </div>
        )}

        {/* Actions overlay */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <WhiteboardDropdown
            handleCopyLink={handleCopyLink}
            openDeleteDialog={openDeleteDialog}
            openRenameDialog={openRenameDialog}
            setIsImageUploadOpen={setIsImageUploadOpen}
            whiteboard={board}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Link
            href={`/whiteboard/${board._id}`}
            className="font-semibold text-gray-900 line-clamp-1 hover:text-blue-600 transition-colors cursor-pointer"
          >
            {board.title}
          </Link>
        </div>

        {/* Tags if available */}
        {board.tags && board.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {board.tags.slice(0, 2).map((tag: string, index: number) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md"
              >
                {tag}
              </span>
            ))}
            {board.tags.length > 2 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                +{board.tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Creator info */}
        <div className="flex items-center gap-2 mb-3">
          {isPending ? (
            <>
              <SkeletonLoader className="h-6 w-6 rounded-full" />
              <SkeletonLoader className="h-3 w-24" />
            </>
          ) : (
            <>
              <Avatar className="h-6 w-6">
                <AvatarImage
                  src={creatorAvatar.imageUrl}
                  alt={creator?.name || "User"}
                />
                <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                  {creatorAvatar.initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs capitalize text-gray-500">
                Created by {getCreatorName()}
              </span>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(board._creationTime)}
          </div>
          {isPending ? (
            <SkeletonLoader className="h-3 w-16" />
          ) : creator ? (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="truncate max-w-20 capitalize">
                {isCreatedByCurrentUser ? "You" : creator.name}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Rename Dialog */}
      <RenameDialog
        board={board}
        handleRename={handleRename}
        isRenameDialogOpen={isRenameDialogOpen}
        isRenameLoading={isRenameLoading}
        newTitle={newTitle}
        setIsRenameDialogOpen={setIsRenameDialogOpen}
        setNewTitle={setNewTitle}
      />
      <DeleteDialog
        whiteboard={board}
        handleDelete={handleDelete}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        isDeleteLoading={isDeleteLoading}
      />
      <ImageUploadDialog
        isOpen={isImageUploadOpen}
        onOpenChange={setIsImageUploadOpen}
        whiteboardId={board._id}
        currentImageUrl={board.imageUrl || undefined}
        onSuccess={() => {
          toast.success("Image updated successfully.");
        }}
      />
    </div>
  );
};

export default WhiteboardCard;
