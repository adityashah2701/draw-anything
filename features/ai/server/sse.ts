import { AIStreamEvent } from "@/features/ai/types";

export const encodeSse = (event: unknown) =>
  `data: ${JSON.stringify(event)}\n\n`;

export const toV1CompatibilityEvents = (
  event: AIStreamEvent,
): unknown[] => {
  switch (event.type) {
    case "phase.started":
    case "phase.completed":
      return [{ type: "thought", message: event.message }];
    case "memory.loaded":
      return [{ type: "thought", message: "Loaded AI memory and canvas context" }];
    case "requirements.extracted":
      return [
        {
          type: "thought",
          message: `Extracted ${event.requirements.length} architecture requirements`,
        },
      ];
    case "infrastructure.expanded":
      return [
        {
          type: "thought",
          message: `Expanded infrastructure with ${event.addedNodeIds.length} supporting components`,
        },
      ];
    case "critic.report":
      return [
        {
          type: "thought",
          message:
            event.notes.length > 0
              ? `Critic found ${event.notes.length} improvement notes`
              : "Critic review passed",
        },
      ];
    case "repair.applied":
      return [{ type: "thought", message: event.summary }];
    case "node.created":
      return [{ type: "thought", message: `Created ${event.node.label}` }];
    case "element.batch":
      return event.elements.map((element) => ({ type: "element", element }));
    case "frame.done":
      return [{ type: "done", count: event.count }];
    case "frame.error":
      return [{ type: "error", message: event.message }];
    default:
      return [];
  }
};
