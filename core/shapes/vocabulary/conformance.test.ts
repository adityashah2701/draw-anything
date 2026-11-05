import { describe, expect, it } from "vitest";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { createShape } from "@/core/shapes/shape-runtime";
import { getToolDefinitions } from "@/core/shapes/shape-tool-registry";
import { flattenPath } from "@/core/shapes/outline/path";
import { renderOutlineToCanvas } from "@/core/shapes/outline/renderer";
import { OUTLINE_VARIANTS, getOutlineVariant, outlineToolName } from "@/core/shapes/outline/variants";
import type { OutlineShape } from "@/core/shapes/outline/types";
import { resolveShape, shapeNames } from "@/features/diagram-code/language/vocab";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { SvgContext } from "@/features/whiteboard/export/svg-context";
import { VOCABULARY, outlinePropsOf, outlineVariantOf, resolveEntry, supportedEntries, type VocabularyEntry } from "./index";

initializeShapeRegistry();
const measurer = { font: "", measureText: (t: string) => ({ width: t.length * 8, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }) };

/**
 * What it takes for an outline entry to count as supported: it draws on the canvas and in the SVG, is made
 * by the shape registry, has a picker tool with an icon, is accepted by the language under its id and every
 * alias, and its picture is its own. Returns the first thing that fails, or null.
 */
const checkOutlineEntry = (entry: VocabularyEntry): string | null => {
  const variant = outlineVariantOf(entry);
  if (!variant || !getOutlineVariant(variant)) return "no outline variant of that id";
  const shape = { id: "s", type: "outline", variant, color: "#000000", strokeWidth: 2, fill: "#eeeeee", label: entry.name, points: [{ x: 0, y: 0 }, { x: 200, y: 120 }] } as OutlineShape;
  try {
    const svg = new SvgContext(measurer);
    renderOutlineToCanvas(shape, { ctx: svg as unknown as CanvasRenderingContext2D, zoom: 1, panOffset: { x: 0, y: 0 } } as never);
    if (!svg.markup().body.includes("<path")) return "draws nothing in the SVG";
  } catch (error) {
    return `fails to export: ${error instanceof Error ? error.message : error}`;
  }
  if (!createShape("outline", { id: "x", variant } as never)) return "the shape registry cannot make it";
  const tool = getToolDefinitions().find((t) => t.name === outlineToolName(variant));
  if (!tool?.icon) return "no picker tool with an icon";
  for (const word of [entry.id, ...entry.aliases]) {
    const parsed = parseDiagramCode(`A [shape: ${word}]`);
    if (parsed.nodes[0]?.shape !== variant) return `the language does not read \`shape: ${word}\` as ${variant}`;
  }
  return null;
};

/**
 * The same gate for a parametric entry: its base outline exists, the picture draws in the SVG with its
 * parameters (a border or marker adds drawing a plain base lacks), the language reads its id and every alias
 * as the base with those parameters, and no other entry or outline draws the same thing.
 */
const checkParametricEntry = (entry: VocabularyEntry, others: readonly VocabularyEntry[]): string | null => {
  const props = outlinePropsOf(entry);
  if (!props || entry.representation.kind !== "parametric") return "not a parametric entry";
  if (!getOutlineVariant(props.variant)) return "no base outline of that id";
  const make = (extra: Partial<OutlineShape>) => ({ id: "s", type: "outline", variant: props.variant, color: "#000000", strokeWidth: 2, fill: "#eeeeee", points: [{ x: 0, y: 0 }, { x: 120, y: 120 }], ...extra }) as OutlineShape;
  const body = (shape: OutlineShape) => {
    const svg = new SvgContext(measurer);
    renderOutlineToCanvas(shape, { ctx: svg as unknown as CanvasRenderingContext2D, zoom: 1, panOffset: { x: 0, y: 0 } } as never);
    return svg.markup().body;
  };
  try {
    const drawn = body(make(props));
    if (!drawn.includes("<path")) return "draws nothing in the SVG";
    if ((props.border || props.marker || props.stack) && drawn === body(make({}))) return "its parameters change nothing in the picture";
  } catch (error) {
    return `fails to export: ${error instanceof Error ? error.message : error}`;
  }
  for (const word of [entry.id, ...entry.aliases]) {
    const node = parseDiagramCode(`A [shape: ${word}]`).nodes[0];
    if (node?.shape !== props.variant || node.border !== props.border || node.marker !== props.marker || node.stack !== props.stack) return `the language does not read \`shape: ${word}\` as ${entry.id}`;
  }
  const same = others.find((o) => o.id !== entry.id && o.representation.kind === "parametric" && JSON.stringify(outlinePropsOf(o)) === JSON.stringify(props));
  return same ? `draws the same picture as ${same.id}` : null;
};

describe("vocabulary", () => {
  it("has unique ids, unique aliases that are never another entry's id, and at least one family each", () => {
    const ids = VOCABULARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const words = VOCABULARY.flatMap((e) => e.aliases);
    expect(new Set(words).size).toBe(words.length);
    expect(words.filter((w) => ids.includes(w))).toEqual([]);
    expect(VOCABULARY.every((e) => e.families.length > 0 && e.guidance.length > 10)).toBe(true);
  });

  it("covers every outline variant exactly once, and names no outline that does not exist", () => {
    const outlines = VOCABULARY.filter((e) => e.representation.kind === "outline");
    expect(outlines.map((e) => outlineVariantOf(e)).sort()).toEqual(OUTLINE_VARIANTS.map((v) => v.id).sort());
  });

  it("never draws one picture under two names", () => {
    const picture = (id: string) => {
      const v = getOutlineVariant(id)!;
      const pts = [...flattenPath(v.path(100, 100)), ...(v.details ? flattenPath(v.details(100, 100)) : [])];
      return pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
    };
    const seen = new Map<string, string>();
    for (const v of OUTLINE_VARIANTS) {
      const key = picture(v.id);
      expect(seen.get(key), `${v.id} draws the same picture as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, v.id);
    }
  });

  it("resolves an id or an alias, in any case and spacing, to its supported entry only", () => {
    expect(resolveEntry("Actor")?.id).toBe("person");
    expect(resolveEntry("speech bubble")?.id).toBe("callout");
    expect(resolveEntry("subroutine")?.id).toBe("predefined-process");
    expect(resolveEntry("table")?.id).toBe("entity-table");
    expect(resolveEntry("nonsense")).toBeUndefined();
  });
});

describe("the support gate", () => {
  it.each(supportedEntries().filter((e) => e.representation.kind === "outline").map((e) => [e.id, e] as const))("outline entry %s passes every check", (_id, entry) => {
    expect(checkOutlineEntry(entry)).toBeNull();
  });

  const parametricEntries = supportedEntries().filter((e) => e.representation.kind === "parametric");

  it.each(parametricEntries.map((e) => [e.id, e] as const))("parametric entry %s passes every check", (_id, entry) => {
    expect(checkParametricEntry(entry, parametricEntries)).toBeNull();
  });

  it("fails a parametric entry that changes nothing, repeats another, or names a base that does not exist", () => {
    const gateway = parametricEntries.find((e) => e.id === "exclusive-gateway")!;
    const plain = { ...gateway, representation: { kind: "parametric", base: "rhombus" } } as VocabularyEntry;
    expect(checkParametricEntry(plain, parametricEntries)).toMatch(/change nothing|does not read/);
    expect(checkParametricEntry({ ...gateway, id: "copy", aliases: [] }, parametricEntries)).toMatch(/does not read|same picture/);
    expect(checkParametricEntry({ ...gateway, representation: { kind: "parametric", base: "nope" } } as VocabularyEntry, parametricEntries)).toMatch(/no base outline/);
  });

  it("fails an entry that names a drawing that does not exist, an entry the language does not read, and one that cannot export", () => {
    const base = supportedEntries().find((e) => e.id === "queue")!;
    expect(checkOutlineEntry({ ...base, representation: { kind: "outline", variant: "no-such-outline" } })).toMatch(/no outline variant/);
    expect(checkOutlineEntry({ ...base, aliases: ["a-word-the-language-does-not-know"] })).toMatch(/does not read/);
  });

  it("lists a planned entry nowhere a person or a model can pick it", () => {
    const planned = VOCABULARY.filter((e) => e.status === "planned");
        const listed = new Set([...supportedEntries().map((e) => e.id), ...supportedEntries().flatMap((e) => e.aliases), ...shapeNames()]);
    for (const entry of planned) {
      for (const word of [entry.id, ...entry.aliases]) {
        expect(listed.has(word), `${word} (planned) must not be listed`).toBe(false);
        expect(resolveShape(word)).toBeUndefined();
      }
    }
    expect(getToolDefinitions().some((t) => planned.some((e) => t.name === outlineToolName(e.id)))).toBe(false);
  });

  it("gives the language every supported outline word, so the docs and completion list the same set", () => {
    for (const entry of supportedEntries().filter((e) => e.representation.kind === "outline")) {
      for (const word of [entry.id, ...entry.aliases]) expect(shapeNames()).toContain(word);
    }
  });
});
