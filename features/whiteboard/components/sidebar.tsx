import { Tool } from "@/features/whiteboard/types/whiteboard.types";
import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Minus,
  MousePointer,
  Pencil,
  Square,
  Type,
} from "lucide-react";

interface SidebarProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
  disabled?: boolean; // Add disabled prop
}

const Sidebar: React.FC<SidebarProps> = ({
  currentTool,
  onToolChange,
  disabled = false, // Default to false
}) => {
  const tools = [
    {
      name: "select",
      icon: MousePointer,
      label: "Select",
      allowInReadOnly: true,
    },
    { name: "pen", icon: Pencil, label: "Pen", allowInReadOnly: false },
    {
      name: "rectangle",
      icon: Square,
      label: "Rectangle",
      allowInReadOnly: false,
    },
    { name: "circle", icon: Circle, label: "Circle", allowInReadOnly: false },
    {
      name: "diamond",
      icon: Diamond,
      label: "Decision",
      allowInReadOnly: false,
    },
    { name: "line", icon: Minus, label: "Line", allowInReadOnly: false },
    { name: "arrow", icon: ArrowRight, label: "Arrow", allowInReadOnly: false },
    { name: "text", icon: Type, label: "Text", allowInReadOnly: false },
    { name: "eraser", icon: Eraser, label: "Eraser", allowInReadOnly: false },
    { name: "hand", icon: Hand, label: "Pan", allowInReadOnly: true },
  ];

  return (
    <div className="bg-white/95 backdrop-blur-xl border border-gray-200/50 flex flex-row items-center px-3 py-2 space-x-1 shadow-lg rounded-full">
      {/* Read-only indicator at the left */}
      {disabled && (
        <div className="flex items-center justify-center px-2">
          <div
            className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"
            title="Read-only mode"
          ></div>
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
            className={`p-2.5 rounded-full transition-colors ${
              isActive && !isToolDisabled
                ? "bg-blue-100 text-blue-600"
                : isActive && isToolDisabled
                  ? "bg-gray-200 text-gray-500" // Active but disabled styling
                  : isToolDisabled
                    ? "text-gray-300 cursor-not-allowed opacity-50"
                    : "text-gray-600 hover:bg-gray-100"
            }`}
            title={
              isToolDisabled ? `${tool.label} (Read-only mode)` : tool.label
            }
          >
            <Icon size={20} />
          </button>
        );
      })}

      {/* Separator */}
      <div className="h-6 w-px bg-gray-300 mx-2"></div>

      {/* Read-only mode explanation */}
      {disabled && (
        <div className="px-2 py-1 text-center">
          <div className="text-xs text-gray-500 leading-tight">View Only</div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
