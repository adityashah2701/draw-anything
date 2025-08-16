import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

// Simple loading spinner component
const LoadingSpinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <div
    className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin`}
  />
);

interface ImageUploadDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  whiteboardId: string;
  currentImageUrl?: string;
  onSuccess?: () => void;
}

export const ImageUploadDialog: React.FC<ImageUploadDialogProps> = ({
  isOpen,
  onOpenChange,
  whiteboardId,
  currentImageUrl,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: generateUploadUrl } = useApiMutation(
    api.whiteboard.generateUploadUrl
  );
  const { mutate: updateImage } = useApiMutation(api.whiteboard.updateImage);
  const { mutate: removeImage } = useApiMutation(api.whiteboard.removeImage);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setSelectedFile(file);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Generate upload URL
      const uploadUrl = await generateUploadUrl({});

      // Step 2: Upload file to Convex storage
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (error) {
              reject(new Error("Invalid response format"));
            }
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.open("POST", uploadUrl);
        xhr.send(selectedFile);
      });

      // Step 3: Get the file ID from the response
      const fileId = result.storageId;

      // Step 4: Update whiteboard with the new image
      const updateResult = await updateImage({
        id: whiteboardId,
        imageFileId: fileId,
      });

      toast.success("Image uploaded successfully!");
      onOpenChange(false);
      if (onSuccess) onSuccess();

      // Reset state
      resetState();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    try {
      await removeImage({ id: whiteboardId });
      toast.success("Image removed successfully!");
      onOpenChange(false);
      if (onSuccess) onSuccess();
      resetState();
    } catch (error) {
      toast.error("Failed to remove image");
    }
  };

  const resetState = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCancel = () => {
    resetState();
    onOpenChange(false);
  };

  // Check if current image is a placeholder
  const isPlaceholderImage = currentImageUrl?.includes("/placeholders/");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Thumbnail</DialogTitle>
          <DialogDescription>
            Upload a custom image or remove the current one to use a random
            placeholder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current/Preview Image */}
          {(currentImageUrl || previewUrl) && (
            <div className="space-y-2">
              <Label>
                {previewUrl ? "New Image Preview" : "Current Image"}
              </Label>
              <div className="relative border border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={previewUrl || currentImageUrl}
                  alt="Preview"
                  className="w-full h-56"
                />
                {currentImageUrl && !previewUrl && !isPlaceholderImage && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 cursor-pointer"
                    onClick={handleRemoveImage}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {isPlaceholderImage && !previewUrl && (
                <p className="text-sm text-gray-500">
                  This is a placeholder image. Upload a custom image to replace
                  it.
                </p>
              )}
            </div>
          )}

          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="image-upload">
              {currentImageUrl && !isPlaceholderImage
                ? "Replace Image"
                : "Upload Image"}
            </Label>
            <div className="flex items-center space-x-2">
              <Input
                id="image-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                disabled={isUploading}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full cursor-pointer"
              >
                <Upload className="w-4 h-4 mr-2" />
                Choose Image
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Supported: JPG, PNG, GIF, WebP. Max size: 10MB.
            </p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isUploading}
            className={cn(
              "cursor-pointer",
              isUploading && "cursor-not-allowed"
            )}
          >
            Cancel
          </Button>

          {/* Remove Image Button (only if not placeholder) */}
          {currentImageUrl && !isPlaceholderImage && !previewUrl && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemoveImage}
              disabled={isUploading}
              className="cursor-pointer"
            >
              <X className="w-4 h-4" />
              Remove
            </Button>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <LoadingSpinner className="w-4 h-4" />
                Uploading...
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
