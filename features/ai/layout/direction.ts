import type { Placement, PlacementEngine, PlacementInput } from "./types";

export type LayoutDirection = "top-to-bottom" | "left-to-right" | "right-to-left" | "bottom-to-top" | "radial";

/** The direction as diagram code writes it; null for the default, which is never written. */
export const codeDirectionOf = (direction: LayoutDirection | undefined): "right" | "up" | "left" | null =>
  direction === "left-to-right" ? "right" : direction === "right-to-left" ? "left" : direction === "bottom-to-top" ? "up" : null;

/**
 * An engine that reads in another direction. The wrapped engine always lays rows out top to bottom; for
 * left to right the graph is laid out transposed (every node's width and height swapped, row gaps and
 * sibling gaps swapped) and the result turned back, so rows become columns without a second engine.
 * Right to left and bottom to top are the mirror image of those. Radial and top to bottom are the engine's own.
 */
export const withDirection =
  (engine: PlacementEngine, direction: LayoutDirection | undefined): PlacementEngine =>
  (input: PlacementInput): Placement => {
    if (!direction || direction === "top-to-bottom" || direction === "radial") return engine(input);
    const sideways = direction === "left-to-right" || direction === "right-to-left";

    let prepared = input;
    if (sideways) {
      // Between columns the connectors (and their labels) run horizontally, so that gap needs the room the row gap had.
      const widestLabel = Math.max(0, ...input.edges.map((e) => e.labelWidth ?? 0));
      const between = Math.max(input.gaps.horizontal, input.gaps.vertical, widestLabel + 48);
      const extra = between - input.gaps.vertical;
      prepared = {
        ...input,
        nodes: input.nodes.map((n) => ({ ...n, width: n.height, height: n.width })),
        gaps: {
          horizontal: input.gaps.vertical,
          vertical: between,
          groupRoom: input.gaps.groupRoom,
          verticalByDepth: input.gaps.verticalByDepth && new Map([...input.gaps.verticalByDepth].map(([depth, gap]) => [depth, gap + extra])),
        },
      };
    }

    const placed = engine(prepared);
    const size = new Map(input.nodes.map((n) => [n.id, n]));
    const turned: Placement = new Map();
    for (const [id, p] of placed) turned.set(id, sideways ? { x: p.y, y: p.x } : { ...p });

    if (direction === "right-to-left" || direction === "bottom-to-top") {
      const horizontal = direction === "right-to-left";
      const far = Math.max(...[...turned].map(([id, p]) => (horizontal ? p.x + size.get(id)!.width : p.y + size.get(id)!.height)));
      for (const [id, p] of turned) {
        turned.set(id, horizontal ? { x: far - (p.x + size.get(id)!.width), y: p.y } : { x: p.x, y: far - (p.y + size.get(id)!.height) });
      }
    }
    return turned;
  };
