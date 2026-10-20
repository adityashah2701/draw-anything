import {
  Anchor,
  Bounds,
  DrawingElement,
  Point,
} from "@/features/whiteboard/types/whiteboard.types";

export type ResizeHandle = string;

export interface ShapeResizeHandle {
  name: string;
  x: number;
  y: number;
  /**
   * An edge handle that can be grabbed anywhere along its edge: the world length of the grab zone,
   * centred on (x, y) and running horizontally for "n"/"s" and vertically for "e"/"w". Absent = a
   * point handle. (Node edges are then resizable without a visible handle sitting on the edge's
   * connection point, which the pointer treats as a connector start.)
   */
  span?: number;
  /** False = a grab zone the canvas does not draw a handle for. Default true. */
  visible?: boolean;
  /** Degrees the handle's frame is turned by (its shape's rotation); set by the runtime, not by shapes. */
  angle?: number;
}

export interface ShapeHitTestOptions {
  radius?: number;
  bounds?: Bounds | null;
  zoom?: number;
}

export interface ShapeResizeHandleOptions {
  bounds?: Bounds | null;
  zoom?: number;
}

export interface ShapeRenderCanvasContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  panOffset: { x: number; y: number };
  getElementBounds: (
    element: DrawingElement,
  ) => { minX: number; minY: number; maxX: number; maxY: number } | null;
  editingTextId?: string | null;
}

export interface ShapeGeometryContext {
  textMeasureContext?: CanvasRenderingContext2D | null;
  zoom?: number;
}

export interface BaseShapeDefinition<T extends DrawingElement> {
  type: T["type"];
  capabilities?: readonly string[];
  create: (props: Partial<T>) => T;
  render: (shape: T) => unknown;
  renderToCanvas: (shape: T, context: ShapeRenderCanvasContext) => void;
  /**
   * Draws this shape's selection outline and resize handles in place of the editor's generic ones.
   * Optional: a shape without it gets the generic chrome. It must draw exactly the handles that
   * `getResizeHandles` returns, because that list is what the pointer hit-tests.
   */
  renderSelection?: (shape: T, context: ShapeRenderCanvasContext) => void;
  getBounds: (shape: T, context?: ShapeGeometryContext) => Bounds | null;
  /**
   * The area in which the shape can be picked, when that is larger than its bounds (a frame's title
   * tab sits outside its box). Used only to find hit candidates; absent = `getBounds`.
   */
  getHitBounds?: (shape: T, context?: ShapeGeometryContext) => Bounds | null;
  getAnchors: (shape: T, bounds?: Bounds | null) => Anchor[];
  onMove?: (shape: T, delta: Point) => T;
  onResize?: (
    shape: T,
    handle: ResizeHandle,
    point: Point,
    originalBounds?: Bounds,
  ) => T;
  containsPoint?: (
    shape: T,
    point: Point,
    options?: ShapeHitTestOptions,
  ) => boolean;
  getResizeHandles?: (
    shape: T,
    options?: ShapeResizeHandleOptions,
  ) => ShapeResizeHandle[];
  validate?: (shape: T) => boolean;

  /** Config for how this shape appears in the toolbar sidebar */
  toolbarConfig?: {
    /** Using unknown for icon type to avoid a direct server-side React dependency.
        The UI component will cast this. */
    icon: unknown;
    /** Human-readable label */
    label: string;
    /** Keyboard shortcut character */
    shortcut?: string;
    /** Grouping in sidebar */
    group: "shapes" | "connectors" | "drawing" | "tools";
    /** Order within the group (lower = higher in list) */
    order?: number;
  };

  /** Config for which properties panel sections to show */
  propertiesConfig?: {
    supportsColor: boolean;
    supportsFill: boolean;
    supportsStrokeWidth: boolean;
    supportsFontSize: boolean;
  };

  /** Config for how the embedded label is rendered */
  labelConfig?: {
    /** Where to anchor the text within the shape */
    anchor: "center" | "top" | "bottom" | "none";
    /** Padding from shape edges in pixels */
    padding: number;
    /** Vertical alignment within the anchor region */
    verticalAlign: "middle" | "top" | "bottom";
  };
}
