import React from "react";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Upload, 
  Users,  
  Zap, 
  FileText,
  ArrowRight,
  BookTemplate
} from "lucide-react";

interface QuickActionsProps {
  onCreateWhiteboard: () => void;
  onUploadFile: () => void;
  onInviteTeam: () => void;
}

const QuickActions = ({ 
  onCreateWhiteboard, 
  onUploadFile, 
  onInviteTeam, 
 
}: QuickActionsProps) => {
  const actions = [
    {
      title: "Create Whiteboard",
      description: "Start with a blank canvas",
      icon: <Plus className="w-6 h-6" />,
      color: "bg-blue-50 text-blue-600 border-blue-200",
      hoverColor: "hover:bg-blue-100",
      onClick: onCreateWhiteboard
    },
    {
      title: "Upload & Edit",
      description: "Import images or documents",
      icon: <Upload className="w-6 h-6" />,
      color: "bg-green-50 text-green-600 border-green-200",
      hoverColor: "hover:bg-green-100",
      onClick: onUploadFile
    },
    {
      title: "Invite Team",
      description: "Add collaborators",
      icon: <Users className="w-6 h-6" />,
      color: "bg-purple-50 text-purple-600 border-purple-200",
      hoverColor: "hover:bg-purple-100",
      onClick: onInviteTeam
    },
  ];

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Quick Actions</h2>
      
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant="outline"
            onClick={action.onClick}
            className={`h-auto p-6 border-2 ${action.color} ${action.hoverColor} transition-all duration-200 hover:border-opacity-80 hover:shadow-sm flex flex-col items-start text-left space-y-2`}
          >
            <div className="w-12 h-12 rounded-xl bg-white border border-current border-opacity-20 flex items-center justify-center mb-2">
              {action.icon}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">{action.title}</h3>
              <p className="text-sm text-gray-600 font-normal truncate text-ellipsis max-w-[13rem]">{action.description}</p>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;