import { Tool } from "@/types/whiteboard.types";
import {  ArrowRight, Circle, Eraser, Hand, Minus, MousePointer, Pencil, Square, Type } from "lucide-react";

interface SidebarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  disabled?: boolean; // Add disabled prop
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentTool, 
  onToolChange, 
  disabled = false // Default to false
}) => {
  const tools = [
    { name: 'select', icon: MousePointer, label: 'Select', allowInReadOnly: true },
    { name: 'pen', icon: Pencil, label: 'Pen', allowInReadOnly: false },
    { name: 'rectangle', icon: Square, label: 'Rectangle', allowInReadOnly: false },
    { name: 'circle', icon: Circle, label: 'Circle', allowInReadOnly: false },
    { name: 'line', icon: Minus, label: 'Line', allowInReadOnly: false },
    { name: 'arrow', icon: ArrowRight, label: 'Arrow', allowInReadOnly: false },
    { name: 'text', icon: Type, label: 'Text', allowInReadOnly: false },
    { name: 'eraser', icon: Eraser, label: 'Eraser', allowInReadOnly: false },
    { name: 'hand', icon: Hand, label: 'Pan', allowInReadOnly: true },
  ];

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 space-y-2">
      {/* Read-only indicator at the top */}
      {disabled && (
        <div className="w-12 h-12 flex items-center justify-center">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Read-only mode"></div>
        </div>
      )}
      
      {tools.map((tool) => {
        const Icon = tool.icon;
        const isToolDisabled = disabled && !tool.allowInReadOnly;
        const isActive = currentTool === tool.name;
        
        return (
          <button
            key={tool.name}
            onClick={() => {
              if (!isToolDisabled) {
                onToolChange(tool.name as Tool);
              }
            }}
            disabled={isToolDisabled}
            className={`p-3 rounded-lg transition-colors ${
              isActive && !isToolDisabled
                ? 'bg-blue-500 text-white'
                : isActive && isToolDisabled
                ? 'bg-gray-300 text-gray-500' // Active but disabled styling
                : isToolDisabled
                ? 'text-gray-300 cursor-not-allowed opacity-50'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={
              isToolDisabled 
                ? `${tool.label} (Read-only mode)` 
                : tool.label
            }
          >
            <Icon size={20} />
          </button>
        );
      })}
      
      {/* Separator */}
      <div className="w-8 h-px bg-gray-300 my-2"></div>
      
      {/* Read-only mode explanation */}
      {disabled && (
        <div className="px-2 py-1 text-center">
          <div className="text-xs text-gray-500 leading-tight">
            View Only
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;