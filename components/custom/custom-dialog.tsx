// components/ui/clerk-dialog.tsx
"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import React, { ReactNode } from "react";

interface ClerkDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
  children: ReactNode;
  title?: string;
}

export const ClerkDialog = ({
  isOpen,
  onOpenChange,
  trigger,
  children,
  title = "",
}: ClerkDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-full bg-transparent p-0 border-none">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="clerk-component-wrapper relative">{children}</div>
      </DialogContent>
    </Dialog>
  );
};
