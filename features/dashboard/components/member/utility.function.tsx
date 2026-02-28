"use client"
import React, { createContext, useContext, ReactNode, JSX } from "react";
import { Crown, Eye, type LucideIcon, Shield } from "lucide-react";

type MemberContextType = {
  getRoleIcon: (role: string) => JSX.Element;
  getRoleColor: (role: string) => string;
  formatRole: (role: string) => string;
};

const MemberContext = createContext<MemberContextType | undefined>(undefined);

export const MemberProvider = ({ children }: { children: ReactNode }) => {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "org:admin":
        return <Crown className="w-4 h-4" />;
      case "org:member":
        return <Shield className="w-4 h-4" />;
      default:
        return <Eye className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "org:admin":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "org:member":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const formatRole = (role: string) => {
    switch (role) {
      case "org:admin":
        return "Admin";
      case "org:member":
        return "Member";
      default:
        return "Member";
    }
  };

  return (
    <MemberContext.Provider
      value={{
        getRoleIcon,
        getRoleColor,
        formatRole,
      }}
    >
      {children}
    </MemberContext.Provider>
  );
};

export const useMember = () => {
  const context = useContext(MemberContext);
  if (!context) {
    throw new Error("useMember must be used within a MemberProvider");
  }
  return context;
};
