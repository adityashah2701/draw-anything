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
          <DialogTitle>Rename whiteboard</DialogTitle>
          <DialogDescription>
            Everyone with access sees the new name.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
            <Label htmlFor="name" className="label-mono">
              Name
            </Label>
            <Input
              id="name"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Whiteboard name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
            />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
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
