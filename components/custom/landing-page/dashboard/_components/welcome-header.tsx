import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Bell } from "lucide-react";
import CreateWhiteboardDialog from "@/components/custom/create-whiteboard";

interface WelcomeHeaderProps {
  user: any;
  handleCreateWhiteboard: () => void;
}

const WelcomeHeader = ({
  user,
  handleCreateWhiteboard,
}: WelcomeHeaderProps) => {
  const getCurrentGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="mb-7">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-4xl font-bold text-gray-900">
              {getCurrentGreeting()},{" "}
              {user?.firstName || user?.fullName || "there"}
            </h1>
          </div>
          <p className="text-lg text-gray-600 mb-2">
            Ready to bring your ideas to life?
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>{getCurrentDate()}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-4 lg:mt-0">
          <Button
            variant="outline"
            className="border-gray-300 hover:border-gray-400"
          >
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </Button>

          <Button onClick={handleCreateWhiteboard}>
            <Plus className="w-4 h-4 mr-2" />
            New Whiteboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeHeader;
