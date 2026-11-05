import { describe, expect, it } from "vitest";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { createShape, shapeContainsPoint } from "@/core/shapes/shape-runtime";
import { VOCABULARY, supportedEntries } from "@/core/shapes/vocabulary";
import {
  buildShapeElement,
  pickerEntries,
  pickerShapes,
  recentShapes,
  shapeCategories,
  shapeFamilies,
  shapeLabel,
  withRecentShape,
} from "./shape-picker";
import { PREVIEW, shapePreview } from "./shape-preview";

initializeShapeRegistry();
const ids = (list: Array<{ id: string }>) => list.map((e) => e.id);

describe("the shape picker's list", () => {
  it("offers every supported entry except the bare icon, and no planned one", () => {
    const offered = ids(pickerEntries());
    expect(offered).not.toContain("icon");
    for (const entry of VOCABULARY.filter((e) => e.status === "planned")) expect(offered).not.toContain(entry.id);
    expect(offered.length).toBe(supportedEntries().filter((e) => e.representation.kind !== "element" && e.id !== "icon").length);
  });

  it("finds an entry by its name, its id, an alias, in any case", () => {
    expect(ids(pickerShapes("Queue", null, null))[0]).toBe("queue");
    expect(ids(pickerShapes("xor", null, null))[0]).toBe("exclusive-gateway");
    expect(ids(pickerShapes("ACTOR", null, null))[0]).toBe("person");
    expect(ids(pickerShapes("speech bubble", null, null))[0]).toBe("callout");
  });

  it("ranks a name above a category above the guidance line, and finds a word inside a name", () => {
    const gateways = ids(pickerShapes("gateway", null, null));
    expect(gateways).toEqual(expect.arrayContaining(["exclusive-gateway", "parallel-gateway", "inclusive-gateway"]));
    expect(gateways[0]).toBe("diamond"); // "gateway" is its alias, an exact match
    expect(pickerShapes("bpmn", null, null)[0].category).toBe("bpmn"); // a category ranks above a mention in a guidance line
    expect(ids(pickerShapes("bpmn", null, null)).length).toBeGreaterThan(5);
    expect(pickerShapes("zzzz-nothing", null, null)).toEqual([]);
  });

  it("filters by category and by family, and by both", () => {
    expect(pickerShapes("", "bpmn", null).every((e) => e.category === "bpmn")).toBe(true);
    const er = pickerShapes("", null, "er");
    expect(er.every((e) => e.families.includes("er"))).toBe(true);
    expect(ids(er)).toContain("cylinder");
    expect(ids(er)).not.toContain("queue"); // architecture only
    expect(ids(pickerShapes("", "storage", "flowchart"))).toEqual(["cylinder"]);
    expect(ids(pickerShapes("gateway", null, "architecture"))).not.toContain("exclusive-gateway");
  });

  it("lists categories and families that have an entry, and nothing empty", () => {
    for (const category of shapeCategories()) expect(pickerShapes("", category, null).length).toBeGreaterThan(0);
    for (const family of shapeFamilies()) expect(pickerShapes("", null, family).length).toBeGreaterThan(0);
    expect(shapeFamilies()).toEqual(expect.arrayContaining(["architecture", "flowchart", "er", "uml"]));
  });

  it("without a query groups entries by category in a fixed order, and is stable", () => {
    const first = ids(pickerShapes("", null, null));
    expect(first).toEqual(ids(pickerShapes("", null, null)));
    const order = shapeCategories();
    const categories = pickerShapes("", null, null).map((e) => e.category);
    expect(categories.map((c) => order.indexOf(c))).toEqual([...categories.map((c) => order.indexOf(c))].sort((a, b) => a - b));
  });

  it("gives every entry an accessible name that says what it is and when to use it", () => {
    for (const entry of pickerEntries()) {
      const label = shapeLabel(entry);
      expect(label).toContain(entry.name);
      expect(label).toContain(entry.guidance);
    }
  });
});

describe("inserting a shape", () => {
  const center = { x: 500, y: 300 };

  it("builds an element the registry accepts and that is centred, for every entry the picker offers", () => {
    for (const entry of pickerEntries()) {
      const el = buildShapeElement(entry, center, `id-${entry.id}`);
      expect(el, entry.id).toBeDefined();
      const made = createShape(el!.type, el as never);
      expect(made, entry.id).toBeTruthy();
      const [a, b] = el!.points;
      expect((a.x + b.x) / 2).toBeCloseTo(center.x, 5);
      expect((a.y + b.y) / 2).toBeCloseTo(center.y, 5);
      expect(shapeContainsPoint(el!, center)).toBe(true);
    }
  });

  it("carries a parametric entry's border and marker, and stores nothing for a plain one", () => {
    const timer = buildShapeElement(pickerEntries().find((e) => e.id === "timer-event")!, center, "a") as unknown as Record<string, unknown>;
    expect(timer).toMatchObject({ type: "outline", variant: "ring", border: "double", marker: "clock" });
    const queue = buildShapeElement(pickerEntries().find((e) => e.id === "queue")!, center, "b") as unknown as Record<string, unknown>;
    for (const key of ["border", "marker", "stack"]) expect(key in queue).toBe(false);
    expect(buildShapeElement(pickerEntries().find((e) => e.id === "diamond")!, center, "c")).toMatchObject({ type: "diamond" });
  });

  it("builds a structured element with starter content, centred", () => {
    const made = buildShapeElement(VOCABULARY.find((e) => e.id === "entity-table")!, center, "x") as unknown as { type: string; points: Array<{ x: number; y: number }> };
    expect(made.type).toBe("entity-table");
    expect((made.points[0].x + made.points[1].x) / 2).toBeCloseTo(center.x, 1);
  });
});

describe("recent shapes", () => {
  it("keeps the newest first, once each, to a limit, and drops ids that no longer exist", () => {
    expect(withRecentShape(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(withRecentShape(Array.from({ length: 8 }, (_, i) => `s${i}`), "new")).toHaveLength(8);
    expect(ids(recentShapes(["queue", "no-longer-supported", "cloud"]))).toEqual(["queue", "cloud"]);
  });
});

describe("shape previews", () => {
  const entry = (id: string) => pickerEntries().find((e) => e.id === id)!;
  const numbers = (p: NonNullable<ReturnType<typeof shapePreview>>) =>
    [...p.outlines.map((o) => o.d), ...p.marks.map((m) => m.d)].flatMap((d) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));

  it("draws every entry the picker offers, inside its box", () => {
    for (const e of pickerEntries()) {
      const p = shapePreview(e);
      expect(p, e.id).toBeDefined();
      expect(p!.outlines.length, e.id).toBeGreaterThan(0);
      const xy = numbers(p!);
      expect(Math.min(...xy), e.id).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xy), e.id).toBeLessThanOrEqual(PREVIEW.width);
      for (const c of p!.circles) {
        expect(c.cx - c.r, e.id).toBeGreaterThanOrEqual(0);
        expect(c.cx + c.r, e.id).toBeLessThanOrEqual(PREVIEW.width);
        expect(c.cy - c.r, e.id).toBeGreaterThanOrEqual(0);
        expect(c.cy + c.r, e.id).toBeLessThanOrEqual(PREVIEW.height);
      }
    }
  });

  it("shows a border, a marker and a stack, so two parametric pictures never look alike in the picker", () => {
    const thin = shapePreview(entry("start-event"))!;
    const thick = shapePreview(entry("end-event"))!;
    const double = shapePreview(entry("intermediate-event"))!;
    expect(Math.max(...thick.outlines.map((o) => o.width))).toBeGreaterThan(Math.max(...thin.outlines.map((o) => o.width)));
    expect(double.outlines.length).toBe(thin.outlines.length + 1);
    expect(shapePreview(entry("initial-state"))!.circles.length + shapePreview(entry("exclusive-gateway"))!.marks.length).toBeGreaterThan(0);
    const keys = pickerEntries().filter((e) => e.representation.kind === "parametric").map((e) => JSON.stringify(shapePreview(e)));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
