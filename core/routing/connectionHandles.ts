import { ConnectionHandle } from "@/features/whiteboard/types/whiteboard.types";

export type { ConnectionHandle };

export interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ConnectionHandlePoint {
  name: ConnectionHandle;
  x: number;
  y: number;
}

export const getConnectionHandlesForBounds = (
  bounds: BoundsLike,
): ConnectionHandlePoint[] => {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  return [
    { name: "top", x: cx, y: bounds.minY },
    { name: "right", x: bounds.maxX, y: cy },
    { name: "bottom", x: cx, y: bounds.maxY },
    { name: "left", x: bounds.minX, y: cy },
  ];
};

export const getConnectionHandlePoint = (
  bounds: BoundsLike,
  handle: ConnectionHandle,
): ConnectionHandlePoint => {
  const handles = getConnectionHandlesForBounds(bounds);
  return handles.find((item) => item.name === handle) ?? handles[0];
};
