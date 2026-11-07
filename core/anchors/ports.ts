import type { AnchorSide } from "@/core/model";
import type { BoundsLike } from "./anchor-geometry";

/**
 * Attachment points along a side, beyond its middle. A port id extends the plain anchor id
 * (`<id>-anchor-<side>`) with the position along the side in whole percent
 * (`<id>-anchor-p25-<side>`), so it still ends in the side name and the older `parseAnchorSide` reads it.
 * The position is part of the id, so a port needs no anchor list entry: the point is computed from the
 * shape's current box, which keeps it on its side when the shape moves or is resized.
 */
export const portAnchorId = (elementId: string, side: AnchorSide, fraction: number): string =>
  `${elementId}-anchor-p${Math.round(fraction * 100)}-${side}`;

const PORT_ID = /-anchor-p(\d{1,3})-(top|right|bottom|left)$/;

export const parsePortAnchorId = (anchorId: string): { side: AnchorSide; fraction: number } | null => {
  const match = PORT_ID.exec(anchorId);
  if (!match) return null;
  const percent = Number(match[1]);
  if (percent > 100) return null;
  return { side: match[2] as AnchorSide, fraction: percent / 100 };
};

/** The point at `fraction` along `side`: left to right on top and bottom, top to bottom on left and right. */
export const portPoint = (bounds: BoundsLike, side: AnchorSide, fraction: number) => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  switch (side) {
    case "top":
      return { x: bounds.minX + width * fraction, y: bounds.minY };
    case "bottom":
      return { x: bounds.minX + width * fraction, y: bounds.maxY };
    case "left":
      return { x: bounds.minX, y: bounds.minY + height * fraction };
    case "right":
      return { x: bounds.maxX, y: bounds.minY + height * fraction };
  }
};

const MIN_PORT_STEP = 14;
const MAX_PORT_STEP = 28;
const EDGE_MARGIN = 0.1;

/**
 * Where `count` ports go on a side of `sideLength`: evenly about the middle, 14 to 28 units apart when the
 * side allows it, and never nearer than a tenth of the side to a corner. In whole percent, as ids hold them.
 */
export const spreadFractions = (count: number, sideLength: number): number[] => {
  if (count <= 1 || !(sideLength > 0)) return [0.5];
  let step = Math.min(MAX_PORT_STEP, Math.max(MIN_PORT_STEP, (sideLength * 0.6) / (count - 1)));
  if (step * (count - 1) > sideLength * 0.8) step = (sideLength * 0.8) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const raw = 0.5 + ((i - (count - 1) / 2) * step) / sideLength;
    return Math.round(Math.min(1 - EDGE_MARGIN, Math.max(EDGE_MARGIN, raw)) * 100) / 100;
  });
};
