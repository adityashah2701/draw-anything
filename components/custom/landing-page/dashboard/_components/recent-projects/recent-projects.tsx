import React from "react";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "./empty-recent-projects-state";
import { WhiteboardCard } from "./whiteboard-card";

interface Whiteboard {
  _id: string;
  createdAt: number;
  imageUrl?: string;
  content?: string;
  tags?: string[];
  lastModifiedBy?: string;
  title: string;
}

interface RecentProjectsProps {
  projects: Whiteboard[];
}

const RecentProjects = ({ projects }:RecentProjectsProps) => {
  const { mutate } = useApiMutation(api.whiteboard.remove);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    if (diffInHours < 48) return "Yesterday";
    if (diffInHours < 24 * 7) return `${Math.floor(diffInHours / 24)} days ago`;

    return date.toLocaleDateString();
  };
  const getContentStats = (whiteboard: Whiteboard) => {
    const content = whiteboard.content || "";
    let elementCount = 0;

    try {
      if (content) {
        const parsed = JSON.parse(content);
        elementCount = parsed.elements?.length || 0;
      }
    } catch {
      // If parsing fails, estimate based on content length
      elementCount = Math.floor(content.length / 100);
    }

    return {
      elementCount,
      complexity:
        elementCount > 50 ? "complex" : elementCount > 20 ? "medium" : "simple",
    };
  };
  const handleDelete = async (id: string) => {
    try {
      await mutate({ id });
      toast.success("Whiteboard deleted successfully.");
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-gray-900">
            Recent Whiteboards
          </h2>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {projects.map((whiteboard) => (
            <WhiteboardCard
              key={whiteboard._id}
              whiteboard={whiteboard}
              handleDelete={handleDelete}
              formatDate={formatDate}
              getContentStats={getContentStats}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentProjects;
