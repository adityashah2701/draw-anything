import React from "react";
import { Tool } from "@/features/whiteboard/types/whiteboard.types";

interface StatusSectionProps {
  currentTool: Tool;
  isSaving: boolean;
  lastSaved: Date | null;
  disabled: boolean;
}

export const StatusSection: React.FC<StatusSectionProps> = ({
  currentTool: _currentTool,
  isSaving,
  lastSaved,
  disabled,
}) => {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2">
        {isSaving ? (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-700">
              Saving...
            </span>
          </>
        ) : lastSaved ? (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-slate-700">
              {lastSaved.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </>
        ) : (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span className="text-[11px] text-slate-700">
              {disabled ? "Read-only" : "Not saved"}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
