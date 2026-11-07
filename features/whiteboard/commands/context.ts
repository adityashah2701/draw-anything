import { createAnchorIndex } from "@/core/anchors/generate-anchors";
import { createConnectorRouter, type ConnectorRouter } from "@/core/arrow/connector-router";
import { buildGroupIndex, splitStored, type GroupIndex } from "@/core/groups/group-index";
import { createRouteEngineState } from "@/core/routing/route-engine";
import { getShapeBounds } from "@/core/shapes/shape-runtime";
import type { ArrowElement } from "@/core/shapes/arrow/arrow-utils";
import type { Bounds, DrawingElement, StoredElement } from "@/core/model";
import { rerouteWithLabels } from "./connectors";
import type { CommandContext, CommandContextOptions } from "./types";

export type { CommandContext, CommandContextOptions };

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
