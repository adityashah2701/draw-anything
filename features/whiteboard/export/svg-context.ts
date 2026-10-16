/**
 * A recording stand-in for CanvasRenderingContext2D. The shape renderers draw into it exactly as
 * they draw into the editor canvas, and it produces (1) SVG markup and (2) the extent of the ink
 * (stroke widths, arrowheads and text included). There is one renderer: export never re-implements
 * a shape. Only the calls the renderers use are implemented; anything else throws, so a new
 * drawing operation fails loudly instead of silently disappearing from exports.
 *
 * Output is built from escaped text and validated numbers/colours only: no <script>, <image>,
 * href or external url() is ever written.
 */
import type { PathDataSink } from "@/core/icons/draw";

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface InkBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TextMeasurer {
  font: string;
  measureText(text: string): {
    width: number;
    fontBoundingBoxAscent?: number;
    fontBoundingBoxDescent?: number;
    emHeightAscent?: number;
    emHeightDescent?: number;
  };
}

interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  lineDash: number[];
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  m: Matrix;
  openGroups: number;
}

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9\s.,%/deg-]+\)|[a-z]{3,24}|transparent)$/i;
const FONT_FAMILY = /^[\w\s,'"\-.]+$/;
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const escapeXml = (text: string): string =>
  text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const num = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "0");

const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const isIdentity = (m: Matrix) => m.every((v, i) => v === IDENTITY[i]);

const parseFont = (font: string) => {
  const match = /^(.*?)(\d+(?:\.\d+)?)px\s+(.+)$/.exec(font.trim());
  if (!match) return { style: "normal", weight: "400", size: 16, family: "sans-serif" };
  const tokens = match[1].split(/\s+/);
  const family = match[3].trim();
  return {
    style: tokens.includes("italic") || tokens.includes("oblique") ? "italic" : "normal",
    weight: tokens.find((t) => /^(\d{3}|bold)$/.test(t)) ?? "400",
    size: Number(match[2]),
    family: FONT_FAMILY.test(family) ? family : "sans-serif",
  };
};

type PathPoint = { x: number; y: number };

export class SvgContext implements PathDataSink {
  readonly isPathDataSink = true as const;
  readonly canvas: { width: number; height: number };
  private state: State = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDash: [],
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    m: IDENTITY,
    openGroups: 0,
  };
  private stack: State[] = [];
  private body: string[] = [];
  private defs: string[] = [];
  private d: string[] = [];
  private points: PathPoint[] = [];
  private cursor: PathPoint | null = null;
  private ink: InkBounds | null = null;
  private clipId = 0;

  constructor(private readonly measurer: TextMeasurer, size = { width: 0, height: 0 }) {
    this.canvas = size;
  }

  // ── state ────────────────────────────────────────────────────────────────
  set fillStyle(v: unknown) {
    if (typeof v === "string" && COLOR.test(v.trim())) this.state.fillStyle = v.trim();
  }
  get fillStyle() {
    return this.state.fillStyle;
  }
  set strokeStyle(v: unknown) {
    if (typeof v === "string" && COLOR.test(v.trim())) this.state.strokeStyle = v.trim();
  }
  get strokeStyle() {
    return this.state.strokeStyle;
  }
  set lineWidth(v: number) {
    if (Number.isFinite(v) && v > 0) this.state.lineWidth = v;
  }
  get lineWidth() {
    return this.state.lineWidth;
  }
  set lineCap(v: string) {
    if (["butt", "round", "square"].includes(v)) this.state.lineCap = v;
  }
  get lineCap() {
    return this.state.lineCap;
  }
  set lineJoin(v: string) {
    if (["miter", "round", "bevel"].includes(v)) this.state.lineJoin = v;
  }
  get lineJoin() {
    return this.state.lineJoin;
  }
  set globalAlpha(v: number) {
    if (Number.isFinite(v) && v >= 0 && v <= 1) this.state.globalAlpha = v;
  }
  get globalAlpha() {
    return this.state.globalAlpha;
  }
  set font(v: string) {
    if (typeof v === "string" && /\d+(\.\d+)?px/.test(v)) this.state.font = v;
  }
  get font() {
    return this.state.font;
  }
  set textAlign(v: string) {
    if (["left", "right", "center", "start", "end"].includes(v)) this.state.textAlign = v;
  }
  get textAlign() {
    return this.state.textAlign;
  }
  set textBaseline(v: string) {
    if (["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"].includes(v)) this.state.textBaseline = v;
  }
  get textBaseline() {
    return this.state.textBaseline;
  }
  setLineDash(segments: number[]) {
    if (segments.every((s) => Number.isFinite(s) && s >= 0)) this.state.lineDash = segments.length % 2 ? [...segments, ...segments] : [...segments];
  }
  getLineDash() {
    return [...this.state.lineDash];
  }

  save() {
    this.stack.push({ ...this.state });
    this.state.openGroups = 0;
  }
  restore() {
    const previous = this.stack.pop();
    if (!previous) return;
    this.body.push("</g>".repeat(this.state.openGroups));
    this.state = previous;
  }

  // ── transforms ───────────────────────────────────────────────────────────
  translate(x: number, y: number) {
    this.state.m = mul(this.state.m, [1, 0, 0, 1, x, y]);
  }
  scale(x: number, y: number) {
    this.state.m = mul(this.state.m, [x, 0, 0, y, 0, 0]);
  }
  rotate(angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.state.m = mul(this.state.m, [c, s, -s, c, 0, 0]);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.state.m = [a, b, c, d, e, f];
  }

  // ── paths ────────────────────────────────────────────────────────────────
  beginPath() {
    this.d = [];
    this.points = [];
    this.cursor = null;
  }
  private add(x: number, y: number) {
    this.points.push({ x, y });
    this.cursor = { x, y };
  }
  moveTo(x: number, y: number) {
    this.d.push(`M${num(x)} ${num(y)}`);
    this.add(x, y);
  }
  lineTo(x: number, y: number) {
    this.d.push(`${this.cursor ? "L" : "M"}${num(x)} ${num(y)}`);
    this.add(x, y);
  }
  closePath() {
    if (this.cursor) this.d.push("Z");
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.d.push(`Q${num(cx)} ${num(cy)} ${num(x)} ${num(y)}`);
    this.points.push({ x: cx, y: cy });
    this.add(x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    this.d.push(`C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)}`);
    this.points.push({ x: c1x, y: c1y }, { x: c2x, y: c2y });
    this.add(x, y);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0) {
    const first = Array.isArray(radii) ? radii[0] ?? 0 : radii;
    const r = Math.max(0, Math.min(first, Math.abs(w) / 2, Math.abs(h) / 2));
    if (r === 0) return this.rect(x, y, w, h);
    const a = (px: number, py: number) => `A${num(r)} ${num(r)} 0 0 1 ${num(px)} ${num(py)}`;
    this.d.push(
      `M${num(x + r)} ${num(y)}`,
      `H${num(x + w - r)}`, a(x + w, y + r),
      `V${num(y + h - r)}`, a(x + w - r, y + h),
      `H${num(x + r)}`, a(x, y + h - r),
      `V${num(y + r)}`, a(x + r, y),
      "Z",
    );
    this.points.push({ x, y }, { x: x + w, y: y + h });
    this.cursor = { x: x + r, y };
  }
  arc(x: number, y: number, r: number, start: number, end: number, ccw = false) {
    const TAU = Math.PI * 2;
    const at = (a: number) => ({ x: x + r * Math.cos(a), y: y + r * Math.sin(a) });
    const from = at(start);
    this.d.push(`${this.cursor ? "L" : "M"}${num(from.x)} ${num(from.y)}`);
    if (Math.abs(end - start) >= TAU) {
      const opposite = at(start + Math.PI);
      this.d.push(`A${num(r)} ${num(r)} 0 1 ${ccw ? 0 : 1} ${num(opposite.x)} ${num(opposite.y)}`, `A${num(r)} ${num(r)} 0 1 ${ccw ? 0 : 1} ${num(from.x)} ${num(from.y)}`);
      this.points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r });
      this.cursor = from;
      return;
    }
    const mod = (v: number) => ((v % TAU) + TAU) % TAU;
    const delta = ccw ? -mod(start - end) : mod(end - start);
    const to = at(start + delta);
    this.d.push(`A${num(r)} ${num(r)} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${num(to.x)} ${num(to.y)}`);
    const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 8)));
    this.points.push(from);
    for (let i = 1; i <= steps; i += 1) this.points.push(at(start + (delta * i) / steps));
    this.cursor = to;
  }

  // ── painting ─────────────────────────────────────────────────────────────
  private transformAttr() {
    const m = this.state.m;
    return isIdentity(m) ? "" : ` transform="matrix(${m.map(num).join(" ")})"`;
  }
  private scaleFactor() {
    const [a, b, c, d] = this.state.m;
    return Math.sqrt(Math.abs(a * d - b * c)) || 1;
  }
  private include(x: number, y: number, pad: number) {
    const [dx, dy] = apply(this.state.m, x, y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const b = this.ink ?? { minX: dx, minY: dy, maxX: dx, maxY: dy };
    b.minX = Math.min(b.minX, dx - pad);
    b.minY = Math.min(b.minY, dy - pad);
    b.maxX = Math.max(b.maxX, dx + pad);
    b.maxY = Math.max(b.maxY, dy + pad);
    this.ink = b;
  }
  private includePath(pad: number) {
    for (const p of this.points) this.include(p.x, p.y, pad);
  }
  private opacity(kind: "fill" | "stroke") {
    return this.state.globalAlpha < 1 ? ` ${kind}-opacity="${num(this.state.globalAlpha)}"` : "";
  }
  private strokeAttrs() {
    const s = this.state;
    const dash = s.lineDash.length ? ` stroke-dasharray="${s.lineDash.map(num).join(" ")}"` : "";
    return ` fill="none" stroke="${escapeXml(s.strokeStyle)}" stroke-width="${num(s.lineWidth)}" stroke-linecap="${s.lineCap}" stroke-linejoin="${s.lineJoin}"${dash}${this.opacity("stroke")}`;
  }
  private requireNoPath(path: unknown) {
    if (path !== undefined && typeof path !== "string") throw new Error("SvgContext: painting a Path2D object is not supported (use strokePathData)");
  }

  fill(rule?: unknown) {
    this.requireNoPath(typeof rule === "string" ? undefined : rule);
    if (this.d.length === 0) return;
    this.includePath(0);
    const evenodd = rule === "evenodd" ? ' fill-rule="evenodd"' : "";
    this.body.push(`<path d="${this.d.join(" ")}" fill="${escapeXml(this.state.fillStyle)}"${this.opacity("fill")}${evenodd}${this.transformAttr()}/>`);
  }
  stroke(path?: unknown) {
    this.requireNoPath(path);
    if (this.d.length === 0) return;
    this.includePath((this.state.lineWidth * this.scaleFactor()) / 2);
    this.body.push(`<path d="${this.d.join(" ")}"${this.strokeAttrs()}${this.transformAttr()}/>`);
  }
  /** Used by icon glyphs: raw SVG path data in the current transform (see core/icons/draw.ts). */
  strokePathData(data: string) {
    if (!/^[MmLlHhVvCcSsQqTtAaZz0-9\s.,eE+-]*$/.test(data)) throw new Error("SvgContext: unsafe path data");
    // Glyphs are 24-unit boxes; the extent is the unit box, which is a safe superset of the ink.
    this.include(0, 0, (this.state.lineWidth * this.scaleFactor()) / 2);
    this.include(24, 24, (this.state.lineWidth * this.scaleFactor()) / 2);
    this.body.push(`<path d="${data}"${this.strokeAttrs()}${this.transformAttr()}/>`);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.include(x, y, 0);
    this.include(x + w, y + h, 0);
    this.body.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${escapeXml(this.state.fillStyle)}"${this.opacity("fill")}${this.transformAttr()}/>`);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const pad = (this.state.lineWidth * this.scaleFactor()) / 2;
    this.include(x, y, pad);
    this.include(x + w, y + h, pad);
    this.body.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${this.strokeAttrs()}${this.transformAttr()}/>`);
  }
  clearRect() {
    // Export scenes are drawn onto an empty surface, so there is nothing to clear.
  }
  clip() {
    if (this.d.length === 0) return;
    const id = `clip${(this.clipId += 1)}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.d.join(" ")}"${this.transformAttr()}/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this.state.openGroups += 1;
  }

  // ── text ─────────────────────────────────────────────────────────────────
  measureText(text: string) {
    this.measurer.font = this.state.font;
    return this.measurer.measureText(text);
  }
  fillText(text: string, x: number, y: number) {
    const clean = escapeXml(text);
    if (clean === "") return;
    const font = parseFont(this.state.font);
    const metrics = this.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent ?? font.size * 0.8;
    const descent = metrics.fontBoundingBoxDescent ?? font.size * 0.2;
    const align = this.state.textAlign;
    const left = align === "center" ? x - metrics.width / 2 : align === "right" || align === "end" ? x - metrics.width : x;
    const baseline = this.state.textBaseline;
    const top =
      baseline === "middle" ? y - (ascent + descent) / 2
      : baseline === "top" || baseline === "hanging" ? y
      : baseline === "bottom" ? y - ascent - descent
      : y - ascent;
    this.include(left, top, 0);
    this.include(left + metrics.width, top + ascent + descent, 0);
    const anchor = align === "center" ? "middle" : align === "right" || align === "end" ? "end" : "start";
    // Always emit an alphabetic baseline: canvas "middle" (centre of the em square) and SVG
    // dominant-baseline differ, and many SVG viewers ignore dominant-baseline altogether.
    const emAscent = metrics.emHeightAscent ?? font.size * 0.8;
    const emDescent = metrics.emHeightDescent ?? font.size * 0.2;
    const baselineY =
      baseline === "middle" ? y + (emAscent - emDescent) / 2
      : baseline === "top" || baseline === "hanging" ? y + emAscent
      : baseline === "bottom" ? y - emDescent
      : y;
    this.body.push(
      `<text x="${num(x)}" y="${num(baselineY)}" font-family="${escapeXml(font.family)}" font-size="${num(font.size)}" font-weight="${font.weight}" font-style="${font.style}" fill="${escapeXml(this.state.fillStyle)}"${this.opacity("fill")} text-anchor="${anchor}" xml:space="preserve"${this.transformAttr()}>${clean}</text>`,
    );
  }

  // ── results ──────────────────────────────────────────────────────────────
  /** Extent of everything drawn so far, in the coordinates the renderers used. Null if nothing was drawn. */
  inkBounds(): InkBounds | null {
    return this.ink ? { ...this.ink } : null;
  }
  /** The drawing as SVG elements (open clip groups closed) and the definitions they reference. */
  markup(): { defs: string; body: string } {
    const closing = "</g>".repeat(this.state.openGroups + this.stack.reduce((n, s) => n + s.openGroups, 0));
    return { defs: this.defs.join(""), body: this.body.join("") + closing };
  }
}

export const asCanvasContext = (ctx: SvgContext) => ctx as unknown as CanvasRenderingContext2D;
