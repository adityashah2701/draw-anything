import type { HeadOp } from "@/core/shapes/arrow/arrowhead";
import { isMarkerId, markerOps } from "@/core/shapes/outline/markers";
import { pathToSvg, type OutlinePath } from "@/core/shapes/outline/path";
import { getOutlineVariant } from "@/core/shapes/outline/variants";
import { outlinePropsOf, type VocabularyEntry } from "@/core/shapes/vocabulary";

/** Width and height of a preview, in its own units; the picker scales the SVG. */
export const PREVIEW = { width: 44, height: 32, inset: 3 } as const;

const THIN = 1.4;
const THICK = 3;
const DOUBLE_GAP = 2.2;
const STACK_STEP = 2;

export interface ShapePreview {
  /** Closed outlines, back to front, each with its own line width (a thick border is heavier). */
  outlines: Array<{ d: string; width: number }>;
  /** Marker strokes and fills. */
  marks: Array<{ d: string; filled: boolean }>;
  circles: Array<{ cx: number; cy: number; r: number; filled: boolean }>;
}

const round = (n: number) => Number(n.toFixed(2));
const KAPPA = 0.5522847498;

const PLAIN: Record<string, { width: number; height: number; path: (w: number, h: number) => OutlinePath }> = {
  rectangle: { width: 160, height: 90, path: (w, h) => [["M", 0, 0], ["L", w, 0], ["L", w, h], ["L", 0, h], ["Z"]] },
  diamond: { width: 120, height: 100, path: (w, h) => [["M", w / 2, 0], ["L", w, h / 2], ["L", w / 2, h], ["L", 0, h / 2], ["Z"]] },
  pill: {
    width: 160,
    height: 64,
    path: (w, h) => {
      const r = h / 2;
      const k = KAPPA * r;
      return [
        ["M", r, 0],
        ["L", w - r, 0],
        ["C", w - r + k, 0, w, r - k, w, r],
        ["C", w, r + k, w - r + k, h, w - r, h],
        ["L", r, h],
        ["C", r - k, h, 0, r + k, 0, r],
        ["C", 0, r - k, r - k, 0, r, 0],
        ["Z"],
      ];
    },
  },
};

/**
 * What an entry looks like in the picker, in a PREVIEW-sized box: the same geometry the canvas draws (the
 * variant's own path, the second line of a double border, the marker's own strokes), so a preview cannot drift
 * from the shape. Undefined for an entry that is not drawn as an outline or a plain shape.
 */
/** A schematic picture of a structured element: its parts, not its text. */
const structuredPreview = (type: string): ShapePreview | undefined => {
  const box = (x: number, y: number, w: number, h: number) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  const line = (y: number, x0 = 6, x1 = 38) => `M${x0} ${y}H${x1}`;
  switch (type) {
    case "entity-table":
      return { outlines: [{ d: box(6, 4, 32, 24), width: 1.4 }, { d: line(11), width: 1.4 }], marks: [{ d: `${line(16, 10, 18)}${line(16, 22, 34)}${line(21, 10, 18)}${line(21, 22, 34)}`, filled: false }], circles: [] };
    case "uml-classifier":
      return { outlines: [{ d: box(6, 4, 32, 24), width: 1.4 }, { d: line(11), width: 1.4 }, { d: line(19), width: 1.4 }], marks: [{ d: `${line(15, 10, 30)}${line(23, 10, 28)}`, filled: false }], circles: [] };
    case "mindmap-node":
      return { outlines: [{ d: `M12 9H32A7 7 0 0 1 32 23H12A7 7 0 0 1 12 9Z`, width: 1.4 }], marks: [{ d: "M4 16H8", filled: false }], circles: [] };
    case "lifeline":
      return { outlines: [{ d: box(12, 3, 20, 9), width: 1.4 }], marks: [{ d: "M22 12V29", filled: false }], circles: [] };
    default:
      return undefined;
  }
};

export const shapePreview = (entry: VocabularyEntry): ShapePreview | undefined => {
  if (entry.representation.kind === "element") return structuredPreview(entry.representation.type);
  const props = outlinePropsOf(entry);
  const variant = props ? getOutlineVariant(props.variant) : undefined;
  const plain = entry.representation.kind === "shape" ? PLAIN[entry.representation.shape] : undefined;
  const size = variant?.defaultSize ?? plain;
  if (!size) return undefined;
  const pathOf = (w: number, h: number): OutlinePath => (variant ? variant.path(w, h) : plain!.path(w, h));

  const stack = props?.stack ? STACK_STEP : 0;
  const scale = Math.min((PREVIEW.width - 2 * PREVIEW.inset - 2 * stack) / size.width, (PREVIEW.height - 2 * PREVIEW.inset - 2 * stack) / size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  // The front shape sits at the lower left of the box; a stack's copies peek out up and to the right.
  const left = (PREVIEW.width - w - 2 * stack) / 2;
  const top = (PREVIEW.height - h - 2 * stack) / 2 + 2 * stack;
  const place = (dx: number, dy: number) => (x: number, y: number) => ({ x: left + dx + x, y: top + dy + y });
  const out: ShapePreview = { outlines: [], marks: [], circles: [] };
  const line = (dx: number, dy: number, inset: number, width: number) =>
    out.outlines.push({ d: pathToSvg(pathOf(w - 2 * inset, h - 2 * inset), place(dx + inset, dy + inset)), width });

  if (stack) {
    line(2 * stack, -2 * stack, 0, THIN);
    line(stack, -stack, 0, THIN);
  }
  line(0, 0, 0, props?.border === "thick" ? THICK : THIN);
  if (props?.border === "double") line(0, 0, DOUBLE_GAP, THIN);
  const details = variant?.details?.(w, h);
  if (details) out.outlines.push({ d: pathToSvg(details, place(0, 0)), width: THIN });

  if (isMarkerId(props?.marker)) {
    const r = Math.min(w, h) * 0.22;
    const centre = place(0, 0)(w / 2, h / 2);
    for (const op of markerOps(props.marker, centre.x, centre.y, r) as HeadOp[]) {
      if (op.kind === "circle") out.circles.push({ cx: round(op.cx), cy: round(op.cy), r: round(op.r), filled: op.fill });
      else out.marks.push({ d: op.path.map((c) => (c[0] === "Z" ? "Z" : `${c[0]}${round(c[1])} ${round(c[2])}`)).join(""), filled: op.kind === "fill" });
    }
  }
  return out;
};
