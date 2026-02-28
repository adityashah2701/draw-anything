"use client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import React from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, X } from "lucide-react";
import { OrganizationProfile } from "@clerk/nextjs";

interface InviteButtonProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  showCloseButton?: boolean;
}

const InviteButton = ({ isOpen, setIsOpen, showCloseButton = true }: InviteButtonProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
        variant={"outline"}
          className="mt-4 lg:mt-0 "
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Manage Organization
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-w-[100%]! mx-auto flex justify-center items-center h-auto border-none shadow-none bg-transparent p-0 m-0 overflow-hidden"
      >
        {showCloseButton && (
          <Button
            variant={"ghost"}
            onClick={() => setIsOpen(false)}
            className="absolute z-50 right-2 top-0 lg:right-72 p-2"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        )}
        <DialogTitle></DialogTitle>
        <OrganizationProfile appearance={{
            elements:{
                cardBox:{
                    height:"100%"
                }
            }
        }} routing="hash" />
      </DialogContent>
    </Dialog>
  );
};

export default InviteButton;