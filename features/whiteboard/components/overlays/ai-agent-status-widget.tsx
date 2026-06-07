"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface AIAgentStatusWidgetProps {
  isGenerating: boolean;
  thoughtPhase: string | null;
  placedCount: number;
  currentNodeLabel: string | null;
  error: string | null;
}

export const AIAgentStatusWidget: React.FC<AIAgentStatusWidgetProps> = ({
  isGenerating,
  thoughtPhase,
  placedCount,
  currentNodeLabel,
  error,
}) => {
  if (!isGenerating && !error) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="w-[320px] rounded-2xl border border-violet-500/20 bg-card/95 backdrop-blur-md shadow-2xl p-4 overflow-hidden relative">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-violet-500/5 pointer-events-none" />

        {error ? (
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-center gap-2 text-sm text-destructive font-medium">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span>Generation Failed</span>
            </div>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 font-semibold">
                <Loader2 size={16} className="animate-spin" />
                <span>AI Agent Working</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                {placedCount} placed
              </span>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-violet-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" 
                  style={{ width: '45%' }} 
                />
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="italic truncate pr-2">{thoughtPhase || "Initializing..."}</span>
              </div>
              
              {currentNodeLabel && (
                <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-2 border-t border-border">
                  <span className="truncate">
                    Current: <span className="text-foreground font-medium">{currentNodeLabel}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
