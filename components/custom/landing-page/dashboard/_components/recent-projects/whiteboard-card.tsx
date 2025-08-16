import DeleteDialog from "@/components/custom/dialog/delete-dialog";
import { ImageUploadDialog } from "@/components/custom/dialog/image-upload-dialog";
import RenameDialog from "@/components/custom/dialog/rename-dialog";
import WhiteboardDropdown from "@/components/custom/whiteboard-dropdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { api } from "@/convex/_generated/api";
import { useApiMutation } from "@/hooks/use-api-mutation";
import {
  Calendar,
  Clock,
  Copy,
  Eye,
  ImageIcon,
  Loader,
  MoreVertical,
  Pencil,
  Trash,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export const WhiteboardCard = ({
  whiteboard,
  formatDate,
  getContentStats,
  handleDelete,
  isDeleteLoading,
}: any) => {
  const contentStats = getContentStats(whiteboard);

  const [isRenameLoading, setIsRenameLoading] = useState(false);
  const [newTitle, setTitle] = useState(whiteboard.title || "");
  const { mutate: renameMutate } = useApiMutation(api.whiteboard.update);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const handleCopyLink = (e: any, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const link = `${window.location.origin}/whiteboard/${id}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard!");
  };

  const handleRename = async () => {
    if (newTitle.trim() === "") {
      toast.error("Whiteboard name cannot be empty");
      return;
    }
    if (newTitle.trim() === whiteboard.title) {
      setIsRenameDialogOpen(false);
      return;
    }
    setIsRenameLoading(true);

    try {
      await renameMutate({ id: whiteboard._id, title: newTitle.trim() });
      toast.success("Whiteboard renamed successfully!");
      setIsRenameDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to rename whiteboard");
    } finally {
      setIsRenameLoading(false);
    }
  };

  const openRenameDialog = () => {
    setTitle(whiteboard.title);
    setIsRenameDialogOpen(true);
  };

  const openDeleteDialog = () => {
    setIsDeleteDialogOpen(true);
  };
  return (
    <div className="group bg-white rounded-2xl p-4 border border-gray-200 shadow-sm hover:shadow-xl hover:border-gray-300 transition-all duration-300 cursor-pointer relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-gray-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      {/* Header */}

      <div className="flex items-center gap-2">
        {/* Action menu */}
        <div className="opacity-0 absolute top-5 right-5 group-hover:opacity-100 transition-opacity duration-200 z-50">
          <WhiteboardDropdown
            handleCopyLink={handleCopyLink}
            openDeleteDialog={openDeleteDialog}
            openRenameDialog={openRenameDialog}
            setIsImageUploadOpen={setIsImageUploadOpen}
            whiteboard={whiteboard}
          />
        </div>
      </div>

      {/* Preview Image or Placeholder */}
      <div className="mb-4">
        {whiteboard.imageUrl ? (
          <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={whiteboard.imageUrl}
              alt={whiteboard.title}
              className="w-full h-56 duration-300"
            />
          </div>
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No preview</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-3">
        <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">
          {whiteboard.title}
        </h3>

        {/* Tags */}
        {whiteboard.tags && whiteboard.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {whiteboard.tags.slice(0, 3).map((tag: string, index: number) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
              >
                {tag}
              </span>
            ))}
            {whiteboard.tags.length > 3 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                +{whiteboard.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Whiteboard stats */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatDate(whiteboard._creationTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>
              Created {new Date(whiteboard._creationTime).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
        <span className="text-xs text-gray-500 font-medium">Whiteboard</span>

        {contentStats.elementCount > 0 ? (
          <span className="text-xs text-gray-500 font-medium">
            {contentStats.elementCount} elements
          </span>
        ) : (
          <span className="text-xs text-gray-500 font-medium">0 elements</span>
        )}
      </div>
      <RenameDialog
        board={whiteboard}
        handleRename={handleRename}
        isRenameDialogOpen={isRenameDialogOpen}
        isRenameLoading={isRenameLoading}
        newTitle={newTitle}
        setIsRenameDialogOpen={setIsRenameDialogOpen}
        setNewTitle={setTitle}
      />
      <DeleteDialog
        whiteboard={whiteboard}
        handleDelete={handleDelete}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        isDeleteLoading={isDeleteLoading}
      />
      <ImageUploadDialog
        isOpen={isImageUploadOpen}
        onOpenChange={setIsImageUploadOpen}
        whiteboardId={whiteboard._id}
        currentImageUrl={whiteboard.imageUrl || undefined}
        onSuccess={() => {
          // Optional: Add any additional logic here after successful upload
          // The component will automatically re-render with the new image due to Convex reactivity
        }}
      />
    </div>
  );
};
