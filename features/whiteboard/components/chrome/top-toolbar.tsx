import * as React from "react";
import {
  Grid3X3,
  Redo2,
  Undo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  ArrowLeft,
  Sun,
  Moon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SnapSettingsMenu } from "@/features/whiteboard/components/chrome/snap-settings-menu";
import type { SnapSettings } from "@/features/whiteboard/utils/snap-settings";
import { useTheme } from "next-themes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";

const ICON_BUTTON =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

/** An icon button with a tooltip that names it and, where there is one, its shortcut. */
const ToolbarButton = ({
  label,
  shortcut,
  pressed,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; pressed?: boolean }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={`${ICON_BUTTON} ${pressed ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="flex items-center gap-2">
      <span>{label}</span>
      {shortcut && <Kbd className="border-background/25 bg-transparent text-background/70">{shortcut}</Kbd>}
    </TooltipContent>
  </Tooltip>
);

const Divider = () => <div className="mx-1 h-4 w-px bg-border" aria-hidden />;

interface TopToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  showGrid: boolean;
  whiteboardTitle?: string;
  isLoading?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
  onToggleGrid: () => void;
  onSave: () => void;
  onLoad: () => void;
  onRename?: (title: string) => void;
  onGenerateDiagram?: () => void;
  snapSettings?: SnapSettings;
  onSnapSettingsChange?: (next: Partial<SnapSettings>) => void;
  disabled?: boolean;
}

const TopToolbar: React.FC<TopToolbarProps> = ({
  canUndo,
  canRedo,
  zoom,
  showGrid,
  whiteboardTitle,
  isLoading = false,
  onUndo,
  onRedo,
  onClear,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToScreen,
  onToggleGrid,
  onRename,
  onGenerateDiagram,
  snapSettings,
  onSnapSettingsChange,
  disabled = false,
}) => {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState(whiteboardTitle || "");

  React.useEffect(() => {
    setEditedTitle(whiteboardTitle || "");
  }, [whiteboardTitle]);

  const handleTitleSubmit = () => {
    if (onRename && editedTitle.trim() !== whiteboardTitle) {
      onRename(editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleBackClick = () => {
    router.back();
  };

  return (
    <div className="pointer-events-auto flex h-12 w-full select-none items-center justify-between border-b border-border bg-card px-3 text-foreground">
      {/* Left: back, title, history */}
      <div className="flex min-w-0 flex-shrink-0 items-center gap-1">
        <ToolbarButton label="Back" onClick={handleBackClick}>
          <ArrowLeft size={16} />
        </ToolbarButton>

        <Divider />

        <div className="min-w-0 max-w-[110px] sm:max-w-[300px]">
          {isLoading ? (
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          ) : isEditingTitle ? (
            <input
              autoFocus
              aria-label="Whiteboard name"
              className="w-full rounded-sm border border-primary bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSubmit();
                if (e.key === "Escape") {
                  setEditedTitle(whiteboardTitle || "");
                  setIsEditingTitle(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="block max-w-full cursor-pointer truncate rounded-sm px-1.5 py-0.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
              onClick={() => setIsEditingTitle(true)}
              disabled={disabled}
              title={disabled ? undefined : "Rename"}
            >
              {whiteboardTitle || "Untitled whiteboard"}
            </button>
          )}
        </div>

        <Divider />

        <ToolbarButton label="Undo" shortcut="⌘Z" onClick={onUndo} disabled={!canUndo || disabled}>
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton label="Redo" shortcut="⌘⇧Z" onClick={onRedo} disabled={!canRedo || disabled}>
          <Redo2 size={16} />
        </ToolbarButton>
        <ToolbarButton label="Clear canvas" onClick={onClear} disabled={disabled} className="hover:text-destructive">
          <Trash2 size={16} />
        </ToolbarButton>
      </div>

      {/* Centre: view. On a phone only "fit" stays (pinch zooms), so the bar never overflows. */}
      <div className="hidden flex-shrink-0 items-center gap-0.5 md:flex">
        <ToolbarButton label="Zoom out" onClick={onZoomOut}>
          <ZoomOut size={16} />
        </ToolbarButton>
        <span className="tnum w-12 text-center font-mono text-xs text-muted-foreground" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarButton label="Zoom in" onClick={onZoomIn}>
          <ZoomIn size={16} />
        </ToolbarButton>
        <ToolbarButton label="Reset zoom" onClick={onResetZoom}>
          <RotateCcw size={15} />
        </ToolbarButton>
        <ToolbarButton label="Fit to screen" onClick={onFitToScreen}>
          <Maximize size={15} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="Show grid" pressed={showGrid} onClick={onToggleGrid}>
          <Grid3X3 size={16} />
        </ToolbarButton>
        {snapSettings && onSnapSettingsChange && <SnapSettingsMenu settings={snapSettings} onChange={onSnapSettingsChange} />}
      </div>

      {/* Right: theme */}
      <div className="flex flex-shrink-0 items-center gap-1">
        <ToolbarButton label="Fit to screen" onClick={onFitToScreen} className="md:hidden">
          <Maximize size={15} />
        </ToolbarButton>
        <ToolbarButton label={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </ToolbarButton>
      </div>
    </div>
  );
};

export default TopToolbar;
