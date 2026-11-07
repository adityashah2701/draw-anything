import type { GroupIndex } from "@/core/groups/group-index";
import type { createRouteEngineState } from "@/core/routing/route-engine";
import type { ArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { Bounds, DrawingElement, StoredElement } from "@/core/model";

/**
 * Everything an editor command needs to know about the board, as plain data and functions. The editor's
 * hooks build one from their own memoised state, and the AI tools build one over the board they are
 * editing, so a command is written once and means the same thing for a person and for the agent.
 */
export interface CommandContext {
  /** The whole stored list: shapes and group records, in stacking order. */
  stored: readonly StoredElement[];
  shapes: readonly DrawingElement[];
  index: GroupIndex;
  /** The shape's box on the board, rotation included; null when it has none. */
  getBounds: (shape: DrawingElement) => Bounds | null;
  /** Connectors that must follow `changed` (moved or resized shapes), routed with their new geometry. */
  reroute: (changed: DrawingElement[]) => DrawingElement[];
  /** A connector routed between the shapes it is attached to. */
  routeArrow: (arrow: ArrowElement) => ArrowElement;
  newId: () => string;
}

export interface CommandContextOptions {
  newId: () => string;
  getBounds?: (shape: DrawingElement) => Bounds | null;
  /** Route caches kept between commands on the same board; a fresh one per context when omitted. */
  routeState?: ReturnType<typeof createRouteEngineState>;
}

