import { createAnchorIndex } from "@/core/anchors/generate-anchors";
import { createConnectorRouter, type ConnectorRouter } from "@/core/arrow/connector-router";
import { buildGroupIndex, splitStored, type GroupIndex } from "@/core/groups/group-index";
import { createRouteEngineState } from "@/core/routing/route-engine";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { ArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { Bounds, DrawingElement, StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { rerouteWithLabels } from "./connectors";

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

/**
 * A context over a plain list (tests, the AI tools). The router is built the first time a command asks for
 * it, so commands that never touch a connector do not pay for one.
 */
export const createCommandContext = (stored: readonly StoredElement[], options: CommandContextOptions): CommandContext => {
  const shapes = splitStored(stored).shapes;
  const index = buildGroupIndex(stored);
  // Keyed by object, not id: a moved copy of a shape has the same id but different bounds.
  const boundsCache = new WeakMap<DrawingElement, Bounds | null>();
  const measure = options.getBounds ?? ((shape: DrawingElement) => getShapeBounds(shape));
  const getBounds = (shape: DrawingElement) => {
    if (boundsCache.has(shape)) return boundsCache.get(shape)!;
    const bounds = measure(shape);
    boundsCache.set(shape, bounds);
    return bounds;
  };

  let router: ConnectorRouter | null = null;
  const routerState = options.routeState ?? createRouteEngineState();
  const getRouter = () =>
    (router ??= createConnectorRouter({
      elements: shapes as DrawingElement[],
      anchorIndex: createAnchorIndex(shapes as DrawingElement[], getBounds),
      getElementBounds: getBounds,
      state: routerState,
    }));

  const ctx: CommandContext = {
    stored,
    shapes,
    index,
    getBounds,
    reroute: rerouteWithLabels(
      () => ctx,
      (changed) => getRouter().rerouteConnectedArrowsForChanges(changed) as unknown as DrawingElement[],
    ),
    routeArrow: (arrow) => getRouter().routeArrowByConnections(arrow),
    newId: options.newId,
  };
  return ctx;
};

export { editableIds } from "./editable";
