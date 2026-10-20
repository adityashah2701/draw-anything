import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader } from "lucide-react";
import React from "react";
interface DeleteDialogProps {
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: any
  handleDelete: (id:string) => void;
  isDeleteLoading:boolean;
  whiteboard:any
}
const DeleteDialog = ({isDeleteDialogOpen,setIsDeleteDialogOpen,handleDelete,isDeleteLoading,whiteboard} :DeleteDialogProps) => {
  return (
     <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this whiteboard?</DialogTitle>
            <DialogDescription>
              “{whiteboard.title}” and its comments are removed for everyone in the workspace. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={"destructive"}
              onClick={() => handleDelete(whiteboard._id)}
              disabled={isDeleteLoading}
            >
              {isDeleteLoading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete whiteboard"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  )
}

export default DeleteDialog