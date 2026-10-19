import { beforeAll, describe, expect, it } from "vitest";
import { createEstimateContext } from "@/core/text/estimate";
import { readableOnDark } from "@/core/color/adaptive-color";
import { getIcon, listIcons, loadIconLibrary } from "@/core/icons/registry";
import { withRenderTheme } from "@/core/theme/render-theme";
import { SvgContext } from "@/features/whiteboard/export/svg-context";
import { layoutSemanticNode } from "./layout";
import { renderSemanticNodeToCanvas } from "./renderer";
import type { SemanticNodeShape } from "./types";

const node = (over: Partial<SemanticNodeShape> = {}): SemanticNodeShape =>
  ({
    id: "n",
    type: "semantic-node",
    color: "#1f2937",
    fill: "#eef2ff",
    strokeWidth: 2,
    label: "Orders",
    fontSize: 17,
    fontWeight: "600",
    points: [{ x: 100, y: 50 }, { x: 268, y: 128 }],
    ai: { icon: "database" },
    ...over,
  }) as SemanticNodeShape;

/** Draws through the export recorder (the same renderer the editor canvas runs) and returns its markup. */
const draw = (shape: SemanticNodeShape, { zoom = 1, pan = { x: 0, y: 0 }, dark = false } = {}) => {
  const ctx = new SvgContext(createEstimateContext());
  withRenderTheme(dark, () => {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.strokeWidth;
    renderSemanticNodeToCanvas(shape, { ctx: ctx as unknown as CanvasRenderingContext2D, zoom, panOffset: pan, getElementBounds: () => null, editingTextId: null } as never);
  });
  return ctx.markup().body;
};

const textX = (markup: string) => [...markup.matchAll(/<text x="([\d.-]+)"/g)].map((m) => Number(m[1]));
beforeAll(() => loadIconLibrary());

const glyphPaths = (id: string) => getIcon(id).paths;

describe("semantic node rendering", () => {
  it("draws the icon where the layout puts it and the label to its right, left-aligned", () => {
    const shape = node();
    const layout = layoutSemanticNode({ minX: 100, minY: 50, width: 168, height: 78 });
    const markup = draw(shape);
    for (const d of glyphPaths("database")) expect(markup).toContain(`d="${d}"`);
    // Every line starts at the text box's left edge, which is clear of the icon.
    const xs = textX(markup);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(x).toBeCloseTo(layout.text.x, 1);
    expect(layout.text.x).toBeGreaterThan(layout.icon!.cx + layout.icon!.size / 2);
  });

  it("scales the whole layout with zoom and moves with the pan", () => {
    const base = textX(draw(node()))[0];
    const zoomed = textX(draw(node(), { zoom: 2, pan: { x: 30, y: 0 } }))[0];
    expect(zoomed).toBeCloseTo(base * 2 + 30, 1);
  });

  it("shows the icon the node's metadata names, and the kind's icon when it names none (older boards)", () => {
    expect(draw(node({ ai: { icon: "queue" } }))).toContain(`d="${glyphPaths("queue")[0]}"`);
    const legacy = draw(node({ ai: { semanticKind: "database" } }));
    expect(legacy).toContain(`d="${glyphPaths("database")[0]}"`);
    const bare = draw(node({ ai: undefined }));
    expect(bare).toContain(`d="${glyphPaths("generic")[0]}"`);
  });

  it("a node without nodeStyle draws exactly like one with an empty nodeStyle", () => {
    expect(draw(node({ nodeStyle: {} }))).toBe(draw(node()));
  });

  it("a hidden icon is not drawn and the label is centred in the whole node", () => {
    const shape = node({ nodeStyle: { iconHidden: true } });
    const markup = draw(shape);
    for (const d of glyphPaths("database")) expect(markup).not.toContain(`d="${d}"`);
    const layout = layoutSemanticNode({ minX: 100, minY: 50, width: 168, height: 78 }, shape.nodeStyle);
    expect(layout.align).toBe("center");
    const xs = textX(markup);
    // Centred: the line is not flush with the left padding edge.
    expect(Math.min(...xs)).toBeGreaterThan(layout.text.x);
  });

  it("recolours a line icon on request and leaves a brand mark in its own colours", async () => {
    const tinted = draw(node({ nodeStyle: { iconColor: "#dc2626" } }));
    expect(tinted).toContain("#dc2626");
    expect(draw(node())).not.toContain("#dc2626");
    await loadIconLibrary();
    const brand = listIcons().find((icon) => icon.style === "logo")!;
    const logo = draw(node({ ai: { icon: brand.id }, nodeStyle: { iconColor: "#dc2626" } }));
    expect(logo).toContain(`d="${brand.paths[0]}"`);
    expect(logo).not.toContain("#dc2626");
  });

  it("uses the chosen corner radius", () => {
    const radiusOf = (shape: SemanticNodeShape) => /<rect[^>]* rx="([\d.]+)"/.exec(draw(shape))?.[1] ?? /\bA([\d.]+)/.exec(draw(shape))?.[1];
    expect(draw(node({ nodeStyle: { cornerRadius: 0 } }))).not.toBe(draw(node()));
    expect(radiusOf(node({ nodeStyle: { cornerRadius: 20 } }))).not.toBe(radiusOf(node()));
  });

  it("draws a corrupt nodeStyle as the default instead of failing", () => {
    const bad = node({ nodeStyle: { iconSize: "huge", iconPlacement: "sideways", cornerRadius: Number.NaN } as never });
    expect(draw(bad)).toBe(draw(node()));
  });

  it("copes with a degenerate box and an empty label", () => {
    expect(() => draw(node({ points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }))).not.toThrow();
    expect(() => draw(node({ label: "" }))).not.toThrow();
    expect(draw(node({ points: [{ x: 0, y: 0 }] as never }))).toBe("");
  });

  it("clips the label to the node, so a label that cannot fit is cut rather than drawn over the border", () => {
    const markup = draw(node({ label: "word ".repeat(60), points: [{ x: 100, y: 50 }, { x: 220, y: 110 }] }));
    expect(markup).toContain("clip-path");
  });
});

describe("themes", () => {
  it("a line icon on a node with no fill is lightened on the dark canvas, and left alone on the light one", () => {
    const shape = node({ fill: undefined, ai: { icon: "user" } }); // category "client": slate #475569
    const lightened = readableOnDark("#475569");
    expect(lightened).not.toBe("#475569");
    expect(draw(shape, { dark: false })).toContain('stroke="#475569"');
    const dark = draw(shape, { dark: true });
    expect(dark).toContain(`stroke="${lightened}"`);
    expect(dark).not.toContain('stroke="#475569"');
  });

  it("an icon on a dark fill is lightened even in the light theme, and the same icon on a light fill is not", () => {
    const onDarkFill = draw(node({ fill: "#0f172a", ai: { icon: "user" } }), { dark: false });
    expect(onDarkFill).toContain(`stroke="${readableOnDark("#475569")}"`);
    expect(draw(node({ fill: "#eef2ff", ai: { icon: "user" } }), { dark: true })).toContain('stroke="#475569"');
  });

  it("a user-chosen icon colour is lightened too when it would not read on a dark surface", () => {
    const out = draw(node({ fill: "#0f172a", nodeStyle: { iconColor: "#1e3a8a" } }));
    expect(out).toContain(`stroke="${readableOnDark("#1e3a8a")}"`);
  });

  it("a node with no fill stays legible on the dark canvas: its border and label are lightened, in the light theme they are not", () => {
    const shape = node({ fill: undefined, color: "#1f2937" });
    const light = draw(shape, { dark: false });
    expect(light).toContain('stroke="#1f2937"');
    expect(light).toMatch(/<text[^>]*fill="#1f2937"/);
    const dark = draw(shape, { dark: true });
    const lightened = readableOnDark("#1f2937");
    expect(lightened).not.toBe("#1f2937");
    expect(dark).toContain(`stroke="${lightened}"`);
    expect(dark).toMatch(new RegExp(`<text[^>]*fill="${lightened}"`));
    expect(dark).not.toContain('stroke="#1f2937"');
  });

  it("a node on a light fill keeps its dark border and label in the dark theme", () => {
    const dark = draw(node({ fill: "#eef2ff", color: "#1f2937" }), { dark: true });
    expect(dark).toContain('stroke="#1f2937"');
    expect(dark).toMatch(/<text[^>]*fill="#1f2937"/);
  });

  it("label text keeps contrast with its fill in both themes", () => {
    const dark = draw(node({ fill: "#0f172a", color: "#0f172a" }), { dark: true });
    expect(dark).toMatch(/<text[^>]*fill="#f8fafc"/i);
    // White text on a white fill adapts to black in the light theme.
    const light = draw(node({ fill: "#ffffff", color: "#ffffff" }), { dark: false });
    expect(light).toMatch(/<text[^>]*fill="#000000"/i);
  });
});

