import type { IconDef } from "./registry";

/**
 * User-supplied icons. They are stored inside the element that uses them (`ai.customIcon`), so a board
 * stays self-contained, and they come from whoever edits the board: every read goes through
 * `validateCustomIcon`, which accepts only plain path data, never markup.
 */

const CUSTOM_ICON_LIMITS = {
  maxPaths: 64,
  maxPathChars: 20_000,
  /** All paths together; one icon is copied into every node that uses it. */
  maxTotalChars: 24_000,
  maxViewBox: 4096,
  maxTitle: 40,
} as const;

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,eE+-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#1f2937";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** The icon when `value` is a well-formed custom icon, else null. Never throws. */
export const validateCustomIcon = (value: unknown): IconDef | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !/^custom-[\w-]{1,40}$/.test(v.id)) return null;
  const box = v.viewBox as { width?: unknown; height?: unknown } | undefined;
  if (!box || !finite(box.width) || !finite(box.height)) return null;
  if (box.width <= 0 || box.height <= 0 || box.width > CUSTOM_ICON_LIMITS.maxViewBox || box.height > CUSTOM_ICON_LIMITS.maxViewBox) return null;
  if (!Array.isArray(v.paths) || v.paths.length === 0 || v.paths.length > CUSTOM_ICON_LIMITS.maxPaths) return null;
  let total = 0;
  for (const d of v.paths) {
    if (typeof d !== "string" || !/^\s*[Mm]/.test(d) || d.length > CUSTOM_ICON_LIMITS.maxPathChars || !PATH_DATA.test(d)) return null;
    total += d.length;
  }
  if (total > CUSTOM_ICON_LIMITS.maxTotalChars) return null;
  const style = v.style === "stroke" ? "stroke" : "logo";
  const title = typeof v.title === "string" && v.title.trim() ? v.title.trim().slice(0, CUSTOM_ICON_LIMITS.maxTitle) : "Custom icon";
  const strokeWidth = finite(v.strokeWidth) && v.strokeWidth > 0 && v.strokeWidth <= 64 ? v.strokeWidth : undefined;
  return {
    id: v.id,
    title,
    category: "generic",
    paths: v.paths as string[],
    viewBox: { width: box.width, height: box.height },
    badge: title.slice(0, 3).toUpperCase(),
    style,
    color: typeof v.color === "string" && HEX.test(v.color) ? v.color : FALLBACK_COLOR,
    ...(strokeWidth ? { strokeWidth } : {}),
  };
};

export type SvgImportResult = { icon: IconDef } | { error: string };

const num = (el: Element, name: string, fallback = 0) => {
  const n = Number.parseFloat(el.getAttribute(name) ?? "");
  return Number.isFinite(n) ? n : fallback;
};

/** Geometry of the basic shapes as path data; null for anything this importer does not draw. */
const shapeToPath = (el: Element): string | null => {
  switch (el.localName) {
    case "path":
      return el.getAttribute("d");
    case "line":
      return `M${num(el, "x1")} ${num(el, "y1")}L${num(el, "x2")} ${num(el, "y2")}`;
    case "polyline":
    case "polygon": {
      const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4 || pts.length % 2 || pts.some((n) => !Number.isFinite(n))) return null;
      const pairs = Array.from({ length: pts.length / 2 }, (_, i) => `${pts[2 * i]} ${pts[2 * i + 1]}`);
      return `M${pairs.join("L")}${el.localName === "polygon" ? "Z" : ""}`;
    }
    case "circle":
    case "ellipse": {
      const [cx, cy] = [num(el, "cx"), num(el, "cy")];
      const [rx, ry] = el.localName === "circle" ? [num(el, "r"), num(el, "r")] : [num(el, "rx"), num(el, "ry")];
      return rx > 0 && ry > 0 ? `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0` : null;
    }
    case "rect": {
      const [x, y, w, h] = [num(el, "x"), num(el, "y"), num(el, "width"), num(el, "height")];
      return w > 0 && h > 0 ? `M${x} ${y}h${w}v${h}h${-w}Z` : null;
    }
    default:
      return null;
  }
};

const GEOMETRY = "path,line,polyline,polygon,circle,ellipse,rect";

/**
 * Turns SVG text into a custom icon without ever keeping the markup: only the geometry of basic shapes
 * and one colour survive. Scripts, images, styles, links and event handlers are dropped because nothing
 * but path data is read. Transforms are refused (they would silently distort the icon).
 */
export const importSvgIcon = (svgText: string, fileName: string): SvgImportResult => {
  if (svgText.length > 200_000) return { error: "That file is too large for an icon (200 KB limit)." };
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.querySelector("parsererror")) return { error: "That file is not a valid SVG." };

  const shapes = [...root.querySelectorAll(GEOMETRY)].filter((el) => !el.closest("defs, clipPath, mask, symbol, pattern"));
  if (shapes.length === 0) return { error: "No shapes found. Only paths, lines, polygons, circles, ellipses and rectangles are imported." };
  if (shapes.some((el) => el.closest("[transform]") || el.hasAttribute("transform"))) {
    return { error: "This SVG uses transforms. Export it again with transforms applied (flattened) and retry." };
  }

  let viewBox = { width: 24, height: 24 };
  const vb = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[0] === 0 && vb[1] === 0) viewBox = { width: vb[2], height: vb[3] };
  else if (vb && vb.length === 4) return { error: "The viewBox must start at 0 0 (for example 0 0 24 24)." };
  else {
    const [w, h] = [num(root, "width", 24), num(root, "height", 24)];
    viewBox = { width: w, height: h };
  }

  const paths = shapes.map(shapeToPath).filter((d): d is string => !!d);
  if (paths.length === 0) return { error: "No usable shapes found in that SVG." };

  const paint = (name: string) => {
    for (const el of [...shapes, root]) {
      const raw = el.getAttribute(name);
      if (raw && raw !== "none" && raw !== "currentColor") return raw;
    }
    return undefined;
  };
  const fillsNothing = shapes.every((el) => (el.getAttribute("fill") ?? root.getAttribute("fill")) === "none");
  const stroke = paint("stroke");
  const style = fillsNothing && stroke ? "stroke" : "logo";
  const colorSource = style === "stroke" ? stroke : paint("fill");
  const color = colorSource && HEX.test(colorSource) ? colorSource.toLowerCase() : FALLBACK_COLOR;
  const strokeWidth = Number.parseFloat(paint("stroke-width") ?? "");

  const title = fileName.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim() || "Custom icon";
  const id = `custom-${hash(paths.join("|") + viewBox.width + viewBox.height + color)}`;
  const icon = validateCustomIcon({ id, title, paths, viewBox, style, color, ...(Number.isFinite(strokeWidth) ? { strokeWidth } : {}) });
  return icon ? { icon } : { error: `That icon is too complex (more than ${CUSTOM_ICON_LIMITS.maxPaths} shapes or ${CUSTOM_ICON_LIMITS.maxTotalChars / 1000} KB of path data), or its path data is not plain.` };
};

/** Short stable id so importing the same file twice gives the same icon. */
const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
