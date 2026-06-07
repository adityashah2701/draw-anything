import * as React from "react";
import {
  Grid3X3,
  Redo2,
  Undo2,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  ArrowLeft,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

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
    <div className="h-12 w-full bg-card border-b border-border flex items-center justify-between px-4 select-none text-foreground pointer-events-auto">
      {/* Left Section - Back, Title, Undo/Redo */}
      <div className="flex items-center space-x-3 flex-shrink-0 min-w-0">
        <button
          onClick={handleBackClick}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Go Back"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="w-px h-4 bg-muted" />

        <div className="min-w-0 max-w-[200px] sm:max-w-[300px]">
          {isLoading ? (
            <div className="w-24 h-4 bg-muted rounded animate-pulse" />
          ) : isEditingTitle ? (
            <input
              autoFocus
              className="text-sm font-medium text-foreground bg-transparent border-none outline-none focus:ring-1 focus:ring-violet-500 rounded px-1 w-full"
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
            <h1
              className="text-sm font-medium text-foreground truncate cursor-pointer hover:bg-muted rounded px-1 transition-colors"
              onClick={() => !disabled && setIsEditingTitle(true)}
              title={disabled ? "" : "Click to Rename"}
            >
              {whiteboardTitle || "Untitled Whiteboard"}
            </h1>
          )}
        </div>

        <div className="w-px h-4 bg-muted" />

        <div className="flex items-center space-x-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo || disabled}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
            title="Undo (⌘Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo || disabled}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
            title="Redo (⌘Y)"
          >
            <Redo2 size={16} />
          </button>
          <button
            onClick={onClear}
            disabled={disabled}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer"
            title="Clear Canvas"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Center Section - Zoom and Grid */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-muted-foreground w-12 text-center font-mono">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={onResetZoom}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          title="Reset Zoom"
        >
          <RotateCcw size={15} />
        </button>
        <button
          onClick={onFitToScreen}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          title="Fit to Screen"
        >
          <Maximize size={15} />
        </button>
        
        <div className="w-px h-4 bg-muted mx-1" />

        <button
          onClick={onToggleGrid}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            showGrid
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title="Toggle Grid"
        >
          <Grid3X3 size={16} />
        </button>
      </div>

      {/* Right Section - Status, AI Generate, Collaborators */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        {/* Saved status indicator */}
        <span className="text-[11px] text-muted-foreground opacity-40 hidden sm:inline font-mono">
          Saved
        </span>

        {onGenerateDiagram && (
          <>
            <div className="w-px h-4 bg-muted" />
            <button
              onClick={onGenerateDiagram}
              disabled={disabled}
              className="flex items-center gap-1 px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 text-foreground font-medium text-xs shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Generate diagram with AI"
            >
              <Sparkles size={13} />
              <span>AI Generate</span>
            </button>
          </>
        )}

        <button
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          title="Collaborators"
        >
          <Users size={16} />
        </button>

        <div className="w-px h-4 bg-muted" />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};

export default TopToolbar;
