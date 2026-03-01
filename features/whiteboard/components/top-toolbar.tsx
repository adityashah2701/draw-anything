import * as React from "react";
import {
  Download,
  FolderOpen,
  Grid3X3,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Users,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

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
  onToggleGrid,
  onSave,
  onLoad,
  onRename,
  onGenerateDiagram,
  disabled = false,
}) => {
  const router = useRouter();
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
    <div className="bg-white/90 backdrop-blur-md border border-gray-200/50 p-2 sm:py-3 sm:px-4 flex items-center justify-between overflow-hidden shadow-sm rounded-2xl">
      {/* Left Section - Back Button and Title */}
      <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 min-w-0">
        {/* Back Button */}
        <button
          onClick={handleBackClick}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Go Back"
        >
          <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
        </button>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-300 hidden sm:block flex-shrink-0" />

        {/* Whiteboard Title */}
        <div className="min-w-0 flex-1 max-w-[200px] sm:max-w-[300px]">
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gray-300 rounded animate-pulse"></div>
              <div className="w-24 h-4 bg-gray-300 rounded animate-pulse"></div>
            </div>
          ) : isEditingTitle ? (
            <input
              autoFocus
              className="text-sm sm:text-lg font-medium text-gray-900 bg-transparent border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 w-full"
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
              className="text-sm sm:text-lg font-medium text-gray-900 truncate cursor-pointer hover:bg-gray-100/50 rounded px-1 transition-colors"
              onClick={() => !disabled && setIsEditingTitle(true)}
              title={disabled ? "" : "Click to Rename"}
            >
              {whiteboardTitle || "Untitled Whiteboard"}
            </h1>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-300 hidden sm:block flex-shrink-0" />

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          <button
            onClick={onUndo}
            disabled={!canUndo || disabled}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={disabled ? "Read-only mode" : "Undo"}
          >
            <Undo2 size={18} className="sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo || disabled}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={disabled ? "Read-only mode" : "Redo"}
          >
            <Redo2 size={18} className="sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={onClear}
            disabled={disabled}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hidden sm:block"
            title={disabled ? "Read-only mode" : "Clear Canvas"}
          >
            <Trash2 size={18} className="sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={onSave}
            disabled={disabled}
            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title={disabled ? "Read-only mode" : "Save Whiteboard"}
          >
            <Save size={18} className="sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={onLoad}
            className="p-2 rounded-lg text-green-600 hover:bg-green-50 hidden sm:block"
            title="Load Whiteboard"
          >
            <FolderOpen size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Center Actions - Zoom and Grid Controls */}
      <div className="flex items-center space-x-1 sm:space-x-4 flex-shrink-0">
        <button
          onClick={onZoomOut}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={18} className="sm:w-5 sm:h-5" />
        </button>
        <span className="text-xs sm:text-sm text-gray-600 w-12 sm:w-16 text-center flex-shrink-0">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={18} className="sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={onResetZoom}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          title="Reset Zoom"
        >
          <RotateCcw size={18} className="sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={onToggleGrid}
          className={`p-2 rounded-lg transition-colors ${
            showGrid
              ? "bg-blue-500 text-white"
              : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Toggle Grid"
        >
          <Grid3X3 size={18} className="sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-1 sm:space-x-4 flex-shrink-0">
        {/* Read-only indicator */}
        {disabled && (
          <div className="flex items-center space-x-2 px-2 py-1 bg-yellow-100 border border-yellow-300 rounded-lg">
            <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0"></div>
            <span className="text-xs text-yellow-800 font-medium hidden sm:inline">
              Read-only
            </span>
          </div>
        )}

        {/* AI Generate Button */}
        <button
          onClick={onGenerateDiagram}
          disabled={disabled || !onGenerateDiagram}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-semibold hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md active:scale-95"
          title="Generate diagram with AI"
        >
          <Sparkles size={14} />
          <span className="hidden sm:inline">AI Generate</span>
        </button>

        <button
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          title="Collaborators"
        >
          <Users size={18} className="sm:w-5 sm:h-5" />
        </button>
        <button
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hidden sm:block"
          title="Download"
        >
          <Download size={18} className="sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};

export default TopToolbar;
