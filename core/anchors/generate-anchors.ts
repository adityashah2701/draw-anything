import {
  Anchor,
  AnchorSide,
  DrawingElement,
} from "@/features/whiteboard/types/whiteboard.types";
import {
  ANCHOR_SIDES,
  BoundsLike,
  ShapeBounds,
  boundsToShapeBounds,
  buildAnchorId,
  defaultAnchorBySide,
  generateAnchorsForShape,
  parseAnchorSide,
} from "@/core/anchors/anchor-geometry";
import { getShapeAnchors } from "@/core/shapes/shape-runtime";

export type { Anchor, BoundsLike, ShapeBounds };

export {
  ANCHOR_SIDES,
  boundsToShapeBounds,
  buildAnchorId,
  defaultAnchorBySide,
  generateAnchorsForShape,
  parseAnchorSide,
};

export interface ShapeWithAnchors {
  id: string;
  bounds: ShapeBounds;
  anchors: Anchor[];
}

export const generateAnchorsForElement = (
  element: DrawingElement,
  bounds: BoundsLike | null,
): Anchor[] => {
  if (!bounds) return [];
  return getShapeAnchors(element, {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  });
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
    const bounds = getElementBounds(element);
    if (!bounds) return;

    const shapeAnchors = generateAnchorsForElement(element, bounds);
    if (shapeAnchors.length === 0) return;

    const shapeBounds = boundsToShapeBounds(bounds);
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

export const isAnchorSide = (value: string): value is AnchorSide =>
  ANCHOR_SIDES.includes(value as AnchorSide);
