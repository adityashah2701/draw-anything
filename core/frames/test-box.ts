import { makeBounds } from "@/core/geometry/box";

/** A box from its corners, as the API takes it. */
export const box = (minX: number, minY: number, maxX: number, maxY: number) => makeBounds(minX, minY, maxX, maxY);
