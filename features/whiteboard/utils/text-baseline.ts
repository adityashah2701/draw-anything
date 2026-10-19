import { firstBaselineOffset } from "@/core/text/baseline";
import { resolveTextStyle } from "@/core/shapes/text/text-metrics";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";

type MeasureCtx = Pick<CanvasRenderingContext2D, "font" | "measureText" | "textBaseline">;

/**
 * Where a standalone text's first baseline is, in world units, so guides can line texts up by the
 * line they are read along rather than by their boxes. Other shapes have none: a label inside a shape
 * is centred in it, and its baseline depends on the wrapped layout, so it is not offered as a guide.
 *
 * The context is only used to read font metrics (ascent and descent); it is created lazily so this
 * costs nothing until a drag asks for a baseline, and the answer is cached per font.
 */
export const createBaselineResolver = (makeContext: () => MeasureCtx | null = defaultContext) => {
  let ctx: MeasureCtx | null | undefined;
  const offsets = new Map<string, number>();

  return (element: DrawingElement): number | null => {
    if (element.type !== "text" || !element.text || !element.fontSize || element.points.length === 0) return null;
    const style = resolveTextStyle(element.fontSize, element.fontWeight, element.fontStyle);
    const key = `${style.fontString}|${style.lineHeight}`;
    let offset = offsets.get(key);
    if (offset === undefined) {
      if (ctx === undefined) ctx = makeContext();
      if (!ctx) return null;
      ctx.font = style.fontString;
      offset = firstBaselineOffset(ctx, style.fontSize, style.lineHeight);
      offsets.set(key, offset);
    }
    return element.points[0].y + offset;
  };
};

const defaultContext = (): MeasureCtx | null => {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas").getContext("2d");
};
