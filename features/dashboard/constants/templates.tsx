import React from "react";
import {
  FileText,
  Brain,
  Layers,
  BarChart3,
  MessageSquare,
} from "lucide-react";

export const TEMPLATE_TYPES = [
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Start from scratch with a clean whiteboard",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    id: "brainstorm",
    name: "Brainstorming Session",
    description: "Perfect for ideation and creative thinking",
    icon: <Brain className="w-5 h-5" />,
  },
  {
    id: "project-planning",
    name: "Project Planning",
    description: "Organize tasks, timelines, and resources",
    icon: <Layers className="w-5 h-5" />,
  },
  {
    id: "data-analysis",
    name: "Data Analysis",
    description: "Visualize data and create insights",
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    description: "Capture meeting discussions and action items",
    icon: <MessageSquare className="w-5 h-5" />,
  },
];

export const SUGGESTED_TAGS = [
  "brainstorming",
  "planning",
  "design",
  "strategy",
  "research",
  "meeting",
  "prototype",
  "workflow",
  "analysis",
  "presentation",
];
