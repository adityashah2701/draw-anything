import {
  Anchor,
  AnchorSide,
  DrawingElement,
} from "@/features/whiteboard/types/whiteboard.types";

export type { Anchor };

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeWithAnchors {
  id: string;
  bounds: ShapeBounds;
  anchors: Anchor[];
}

interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const ANCHOR_SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

export const buildAnchorId = (elementId: string, side: AnchorSide): string =>
  `${elementId}-anchor-${side}`;

export const parseAnchorSide = (anchorId: string): AnchorSide | null => {
  const tail = anchorId.split("-").pop();
  if (tail === "top" || tail === "right" || tail === "bottom" || tail === "left") {
    return tail;
  }
  return null;
};

export const boundsToShapeBounds = (bounds: BoundsLike): ShapeBounds => ({
  x: bounds.minX,
  y: bounds.minY,
  width: bounds.maxX - bounds.minX,
  height: bounds.maxY - bounds.minY,
});

const isAnchorShape = (element: DrawingElement) =>
  element.type === "rectangle" ||
  element.type === "circle" ||
  element.type === "diamond";

export const generateAnchorsForShape = (
  shapeId: string,
  bounds: ShapeBounds,
): Anchor[] => {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;

  return [
    { id: buildAnchorId(shapeId, "top"), x: cx, y: top, side: "top" },
    { id: buildAnchorId(shapeId, "right"), x: right, y: cy, side: "right" },
    { id: buildAnchorId(shapeId, "bottom"), x: cx, y: bottom, side: "bottom" },
    { id: buildAnchorId(shapeId, "left"), x: left, y: cy, side: "left" },
  ];
};

export const generateAnchorsForElement = (
  element: DrawingElement,
  bounds: BoundsLike | null,
): Anchor[] => {
  if (!bounds || !isAnchorShape(element)) return [];
  return generateAnchorsForShape(element.id, boundsToShapeBounds(bounds));
};

export interface AnchorRecord {
  elementId: string;
  anchor: Anchor;
}

export interface AnchorIndex {
  shapes: ShapeWithAnchors[];
  anchors: AnchorRecord[];
  anchorsByElementId: Map<string, Anchor[]>;
  anchorByLookupKey: Map<string, Anchor>;
}

export const createAnchorLookupKey = (elementId: string, anchorId: string) =>
  `${elementId}::${anchorId}`;

export const createAnchorIndex = (
  elements: DrawingElement[],
  getElementBounds: (element: DrawingElement) => BoundsLike | null,
): AnchorIndex => {
  const shapes: ShapeWithAnchors[] = [];
  const anchors: AnchorRecord[] = [];
  const anchorsByElementId = new Map<string, Anchor[]>();
  const anchorByLookupKey = new Map<string, Anchor>();

  elements.forEach((element) => {
    if (!isAnchorShape(element)) return;
    const bounds = getElementBounds(element);
    if (!bounds) return;

    const shapeBounds = boundsToShapeBounds(bounds);
    const shapeAnchors = generateAnchorsForShape(element.id, shapeBounds);

    shapes.push({
      id: element.id,
      bounds: shapeBounds,
      anchors: shapeAnchors,
    });
    anchorsByElementId.set(element.id, shapeAnchors);

    shapeAnchors.forEach((anchor) => {
      anchors.push({ elementId: element.id, anchor });
      anchorByLookupKey.set(createAnchorLookupKey(element.id, anchor.id), anchor);
    });
  });

  return {
    shapes,
    anchors,
    anchorsByElementId,
    anchorByLookupKey,
  };
};

export const defaultAnchorBySide = (
  elementId: string,
  side: AnchorSide,
): Anchor => ({
  id: buildAnchorId(elementId, side),
  x: 0,
  y: 0,
  side,
});

export { ANCHOR_SIDES };
