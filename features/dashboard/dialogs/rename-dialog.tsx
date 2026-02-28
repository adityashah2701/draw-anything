import { Button } from "@/components/ui/button";
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
import { Loader } from "lucide-react";
import React from "react";
interface RenameDialogProps {
  isRenameDialogOpen: boolean;
  setIsRenameDialogOpen: any
  newTitle: string;
  setNewTitle: (title:string) => void;
  handleRename: () => void;
  isRenameLoading:boolean;
  board:any
}
const RenameDialog = ({
  isRenameDialogOpen,
  setIsRenameDialogOpen,
  newTitle,
  setNewTitle,
  handleRename,
  isRenameLoading,
  board,

}: RenameDialogProps) => {
  return (
    <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Rename Whiteboard</DialogTitle>
          <DialogDescription>
            Enter a new name for your whiteboard. This will be visible to all
            collaborators.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="col-span-3"
              placeholder="Enter whiteboard name..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsRenameDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleRename}
            disabled={
              isRenameLoading ||
              newTitle.trim() === "" ||
              newTitle.trim() === board.title
            }
          >
            {isRenameLoading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Renaming...
              </>
            ) : (
              "Rename"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameDialog;
