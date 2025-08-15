import { Download, FolderOpen, Grid3X3, Redo2, RotateCcw, Save, Share, Trash2, Undo2, Users, ZoomIn, ZoomOut } from "lucide-react";

interface TopToolbarProps {
  historyStep: number;
  historyLength: number;
  zoom: number;
  showGrid: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleGrid: () => void;
  onSave: () => void;
  onLoad: () => void;
  disabled?: boolean;
}

const TopToolbar: React.FC<TopToolbarProps> = ({
  historyStep,
  historyLength,
  zoom,
  showGrid,
  onUndo,
  onRedo,
  onClear,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleGrid,
  onSave,
  onLoad,
  disabled = false
}) => {
  return (
    <div className="bg-white border-b border-gray-200 p-2 sm:p-4 flex items-center justify-between overflow-hidden">
      {/* Left Actions */}
      <div className="flex items-center space-x-1 sm:space-x-4 flex-shrink-0">
        <button
          onClick={onUndo}
          disabled={historyStep <= 0 || disabled}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? "Read-only mode" : "Undo"}
        >
          <Undo2 size={18} className="sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={onRedo}
          disabled={historyStep >= historyLength - 1 || disabled}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? "Read-only mode" : "Redo"}
        >
          <Redo2 size={18} className="sm:w-5 sm:h-5" />
        </button>
        <div className="w-px h-6 bg-gray-300 hidden sm:block" />
        <button
          onClick={onClear}
          disabled={disabled}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? "Read-only mode" : "Clear Canvas"}
        >
          <Trash2 size={18} className="sm:w-5 sm:h-5" />
        </button>
        <div className="w-px h-6 bg-gray-300 hidden sm:block" />
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

      {/* Center Actions - These remain functional even in read-only mode */}
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
            showGrid ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
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
            <span className="text-xs text-yellow-800 font-medium hidden sm:inline">Read-only</span>
          </div>
        )}
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