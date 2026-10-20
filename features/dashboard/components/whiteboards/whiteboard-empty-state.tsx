import React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptySheet } from "@/components/shared/empty-sheet";

interface WhiteboardEmptyStateProps {
  type: "no-whiteboards" | "no-results";
  searchQuery?: string;
  onCreateNew?: () => void;
  onClearFilters?: () => void;
}

const WhiteboardEmptyState = ({ type, searchQuery, onCreateNew, onClearFilters }: WhiteboardEmptyStateProps) => {
  if (type === "no-results") {
    return (
      <EmptySheet title="Nothing matches" description={searchQuery ? `No whiteboard is called “${searchQuery}”.` : "No whiteboard matches."}>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear search
          </Button>
        )}
      </EmptySheet>
    );
  }
  return (
    <EmptySheet
      title="A blank sheet"
      description="Draw shapes and connectors yourself, or open the AI agent inside a whiteboard and describe the diagram you want."
    >
      <Button onClick={onCreateNew}>
        <Plus /> New whiteboard
      </Button>
    </EmptySheet>
  );
};

export default WhiteboardEmptyState;
