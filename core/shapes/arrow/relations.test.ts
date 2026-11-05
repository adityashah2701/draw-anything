import { describe, expect, it } from "vitest";
import { SvgContext } from "@/features/whiteboard/export/svg-context";
import type { ArrowShape, ConnectorRelation, RelationKind } from "@/features/whiteboard/types/whiteboard.types";
import { drawArrow } from "./arrow-utils";
import { ARROWHEAD_KINDS, arrowheadOps, headTrim } from "./arrowhead";
import {
  RELATIONS,
  cardinalityOf,
  isClassifier,
  normalizeRelation,
  parseCardinality,
  parseEndValue,
  parseMultiplicity,
  parseNotation,
  parseRelationKind,
  relationLook,
  relationProblem,
  reverseRelation,
  withEnd,
  withNotation,
  withRelationKind,
} from "./relations";

const measurer = { font: "", measureText: (t: string) => ({ width: t.length * 7, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }) };

const arrow = (extra: Partial<ArrowShape> = {}): ArrowShape =>
  ({ id: "a", type: "arrow", color: "#000000", strokeWidth: 2, routingMode: "straight", points: [{ x: 0, y: 100 }, { x: 300, y: 100 }], ...extra }) as ArrowShape;

const svgOf = (el: ArrowShape) => {
  const svg = new SvgContext(measurer);
  drawArrow(svg as unknown as CanvasRenderingContext2D, el, 1, { x: 0, y: 0 });
  return svg.markup().body;
};
const rel = (kind: RelationKind, extra: Partial<ConnectorRelation> = {}): ConnectorRelation => ({ kind, ...extra });
const count = (text: string, needle: RegExp) => (text.match(needle) ?? []).length;

describe("the relation table", () => {
  it("has one row per kind with a line style, and heads only where a kind draws them", () => {
    expect(new Set(RELATIONS.map((r) => r.kind)).size).toBe(RELATIONS.length);
    const look = (k: RelationKind) => relationLook(rel(k));
    expect(look("generalization")).toMatchObject({ line: "solid", end: "hollow-triangle" });
    expect(look("realization")).toMatchObject({ line: "dashed", end: "hollow-triangle" });
    expect(look("dependency")).toMatchObject({ line: "dashed", end: "open" });
    expect(look("aggregation")).toMatchObject({ line: "solid", start: "diamond" });
    expect(look("composition")).toMatchObject({ line: "solid", start: "diamond-filled" });
    expect(look("directed-association")).toMatchObject({ line: "solid", end: "open" });
    expect(look("association").end).toBeUndefined();
    expect(look("sync-message")).toMatchObject({ line: "solid", end: "triangle" });
    expect(look("async-message")).toMatchObject({ line: "solid", end: "open" });
    expect(look("return-message")).toMatchObject({ line: "dashed", end: "open" });
    expect(look("destroy-message")).toMatchObject({ line: "solid", end: "cross" });
    expect(look("message-flow")).toMatchObject({ line: "dashed", start: "circle", end: "hollow-triangle" });
    expect(look("bpmn-association")).toMatchObject({ line: "dotted" });
    expect(look("assembly")).toMatchObject({ start: "lollipop", end: "socket" });
  });

  it("reads kind and notation words, with aliases", () => {
    expect(parseRelationKind("Inheritance")).toBe("generalization");
    expect(parseRelationKind("sync message")).toBe("sync-message");
    expect(parseRelationKind("nonsense")).toBeNull();
    expect(parseNotation("Crow's foot")).toBe("crows-foot");
    expect(parseNotation("chen")).toBe("chen");
    expect(parseNotation("pretty")).toBeNull();
  });
});

describe("cardinality and multiplicity are validated, never free text", () => {
  it("accepts numbers, stars and ranges, and rejects the rest", () => {
    for (const ok of ["1", "*", "0..1", "0..*", "1..*", "2..5", "10"]) expect(parseMultiplicity(ok), ok).toBe(ok);
    for (const bad of ["3..", "..3", "many-ish", "5..2", "*..3", "", "1...2", "a..b", "1..2..3"]) expect(parseMultiplicity(bad), bad).toBeNull();
    expect(parseCardinality("many-ish")).toBeNull();
    expect(parseCardinality("N")).toBe("many");
    expect(parseCardinality("zero or one")).toBe("zero-or-one");
    expect(parseEndValue("0..*")).toEqual({ multiplicity: "0..*" });
    expect(parseEndValue("one-or-many")).toEqual({ cardinality: "one-or-many" });
    expect(parseEndValue("3..")).toBeNull();
  });

  it("maps a multiplicity to the nearest ER cardinality", () => {
    expect(cardinalityOf({ multiplicity: "1" })).toBe("one");
    expect(cardinalityOf({ multiplicity: "0..1" })).toBe("zero-or-one");
    expect(cardinalityOf({ multiplicity: "0..*" })).toBe("zero-or-many");
    expect(cardinalityOf({ multiplicity: "*" })).toBe("zero-or-many");
    expect(cardinalityOf({ multiplicity: "1..*" })).toBe("one-or-many");
    expect(cardinalityOf({ cardinality: "exactly-one", multiplicity: "0..*" })).toBe("exactly-one");
    expect(cardinalityOf(undefined)).toBeUndefined();
  });

  it("keeps the valid part of a stored relation and drops the rest, never throwing", () => {
    expect(normalizeRelation(undefined)).toBeUndefined();
    expect(normalizeRelation("x")).toBeUndefined();
    expect(normalizeRelation({ kind: "teleport" })).toBeUndefined();
    expect(normalizeRelation({ kind: "association", end: { multiplicity: "3..", role: "  owner\u0000  " }, start: { multiplicity: "0..*" } })).toEqual({
      kind: "association",
      start: { multiplicity: "0..*" },
      end: { role: "owner" },
    });
    // A kind that takes no end data drops it.
    expect(normalizeRelation({ kind: "generalization", end: { multiplicity: "1" } })).toEqual({ kind: "generalization" });
    expect(normalizeRelation({ kind: "er-relationship", notation: "wobbly", start: { cardinality: "many" } })).toEqual({ kind: "er-relationship", start: { cardinality: "many" } });
    expect(normalizeRelation({ kind: "association", start: { role: "x".repeat(200) } })!.start!.role).toHaveLength(40);
  });

  it("swaps the ends of a reversed relation", () => {
    expect(reverseRelation(rel("composition", { start: { multiplicity: "1" }, end: { multiplicity: "0..*" } }))).toEqual({ kind: "composition", start: { multiplicity: "0..*" }, end: { multiplicity: "1" } });
  });
});

describe("one ER relationship, two notations", () => {
  const one_to_many: ConnectorRelation = { kind: "er-relationship", start: { cardinality: "one" }, end: { cardinality: "many" } };

  it("draws crow's foot as glyphs and Chen as the labels 1 and N, from the same stored data", () => {
    const crow = relationLook(one_to_many);
    expect(crow).toMatchObject({ start: "crow-one", end: "crow-many", labels: [] });
    const chen = relationLook({ ...one_to_many, notation: "chen" });
    expect(chen.start).toBeUndefined();
    expect(chen.end).toBeUndefined();
    expect(chen.labels.map((l) => [l.end, l.text])).toEqual([["start", "1"], ["end", "N"]]);
    // Switching the notation is a change to one field; the end data is what it was.
    expect(one_to_many.start).toEqual({ cardinality: "one" });
    expect(relationLook({ ...one_to_many, notation: "crows-foot" })).toEqual(crow);
  });

  it("draws the prongs and the bar on the canvas, and the text for Chen", () => {
    const crow = svgOf(arrow({ relation: one_to_many }));
    expect(crow).not.toContain("<text");
    const chen = svgOf(arrow({ relation: { ...one_to_many, notation: "chen" } }));
    expect(chen).toContain(">1<");
    expect(chen).toContain(">N<");
    // Crow's foot has more strokes (the bar and three prongs) than the plain Chen line.
    expect(count(crow, /<path/g)).toBeGreaterThan(count(chen, /<path/g));
  });

  it("gives every cardinality its own glyph", () => {
    const kinds = (["one", "exactly-one", "many", "zero-or-one", "zero-or-many", "one-or-many"] as const).map((c) => relationLook({ kind: "er-relationship", end: { cardinality: c } }).end);
    expect(new Set(kinds).size).toBe(6);
  });
});

describe("drawing a relation", () => {
  it("draws the line style and the heads of each kind", () => {
    const solid = (k: RelationKind) => svgOf(arrow({ relation: rel(k) }));
    expect(solid("generalization")).not.toContain("stroke-dasharray");
    expect(solid("realization")).toContain("stroke-dasharray");
    expect(solid("dependency")).toContain("stroke-dasharray");
    expect(solid("bpmn-association")).toContain("stroke-dasharray");
    expect(solid("sync-message")).toContain('fill="#000000"'); // the filled triangle
    expect(solid("generalization")).not.toMatch(/<path[^>]*fill="#000000"[^>]*Z/); // hollow: only stroked
    expect(solid("composition")).toContain('fill="#000000"'); // the filled diamond
    expect(solid("aggregation")).toContain("M12 100"); // the line starts where the hollow diamond ends
  });

  it("stops the line at a hollow head, so the line does not run through it", () => {
    const body = svgOf(arrow({ relation: rel("generalization") }));
    // The line is trimmed by the head length (12) at the target end.
    expect(body).toMatch(/M0 100 L288 100/);
  });

  it("writes multiplicity and role beside the line, at the end they belong to", () => {
    const body = svgOf(arrow({ relation: rel("association", { start: { multiplicity: "1", role: "owner" }, end: { multiplicity: "0..*" } }) }));
    expect(body).toContain(">1<");
    expect(body).toContain(">0..*<");
    expect(body).toContain(">owner<");
    // The start label sits near x=0 and the end label near x=300.
    const x = (text: string) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*>${text.replace(/\./g, "\\.").replace("*", "\\*")}<`).exec(body)![1]);
    expect(x("1")).toBeLessThan(60);
    expect(x("0..*")).toBeGreaterThan(240);
  });

  it("draws a connector with no relation exactly as before", () => {
    const legacy = arrow({ arrowHeadEnd: true, dashed: true });
    expect(svgOf(legacy)).toBe(svgOf({ ...legacy, relation: undefined }));
    expect(svgOf(legacy)).toContain('stroke-dasharray="10 8"');
    expect(svgOf(legacy)).toContain('fill="#000000"');
    // An invalid relation is ignored too: the connector falls back to its flags.
    expect(svgOf({ ...legacy, relation: { kind: "teleport" } as never })).toBe(svgOf(legacy));
  });

  it("keeps the heads on the last real segment of a routed path", () => {
    const bent = arrow({ routingMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }], relation: rel("composition", { start: { multiplicity: "1" }, end: { multiplicity: "*" } }) });
    const body = svgOf(bent);
    expect(body).toContain(">1<");
    expect(body).toContain(">*<");
    // Moving the whole connector moves the glyphs with it and changes no data.
    const moved = { ...bent, points: bent.points.map((p) => ({ x: p.x + 50, y: p.y + 70 })) };
    expect(moved.relation).toEqual(bent.relation);
    expect(svgOf(moved)).toContain(">*<");
  });
});

describe("the new heads", () => {
  const size = { length: 12, width: 7 };
  it("draw finite geometry in every direction, and the line stops where they begin", () => {
    for (const kind of ARROWHEAD_KINDS) {
      for (const dir of [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -0.6, y: 0.8 }]) {
        const ops = arrowheadOps(kind, { x: 10, y: 10 }, dir, size);
        expect(ops.length, kind).toBeGreaterThan(0);
        for (const op of ops) {
          const numbers = op.kind === "circle" ? [op.cx, op.cy, op.r] : op.path.flatMap((c) => (c[0] === "Z" ? [] : [c[1], c[2]]));
          expect(numbers.every(Number.isFinite), kind).toBe(true);
        }
      }
      expect(headTrim(kind, size)).toBeGreaterThanOrEqual(0);
    }
  });

  it("draws a cross for a destroy message, a ball for a provided interface and a cup for a required one", () => {
    expect(arrowheadOps("cross", { x: 0, y: 0 }, { x: 1, y: 0 }, size)).toHaveLength(2);
    expect(arrowheadOps("lollipop", { x: 0, y: 0 }, { x: 1, y: 0 }, size).some((o) => o.kind === "circle")).toBe(true);
    const socket = arrowheadOps("socket", { x: 0, y: 0 }, { x: 1, y: 0 }, size);
    expect(socket.some((o) => o.kind === "stroke" && o.path.length > 8)).toBe(true);
    expect(headTrim("lollipop", size)).toBeGreaterThan(size.length);
  });
});

describe("compatibility", () => {
  it("reports a generalization between non-classifiers, and accepts classes", () => {
    expect(relationProblem("generalization", { name: "Approved?", shape: "diamond" }, { name: "Start", shape: "pill" })).toMatch(/joins classifiers/);
    expect(relationProblem("generalization", { name: "Dog" }, { name: "Animal", shape: "component" })).toBeNull();
    expect(relationProblem("generalization", { name: "Dog" }, { name: "Done", kind: "end" })).toMatch(/"Done" is not one/);
    expect(relationProblem("dependency", { name: "A", shape: "diamond" }, { name: "B", shape: "pill" })).toBeNull();
    expect(isClassifier({ shape: "cylinder" })).toBe(true);
  });
});

describe("editing a relation", () => {
  const er: ConnectorRelation = { kind: "er-relationship", notation: "chen", start: { cardinality: "one", role: "owner" }, end: { cardinality: "many" } };

  it("changes the kind and keeps what the new kind can still show", () => {
    expect(withRelationKind(er, "association")).toEqual({ kind: "association", notation: "chen", start: { role: "owner" } });
    expect(withRelationKind(er, "generalization")).toEqual({ kind: "generalization", notation: "chen" });
    expect(withRelationKind(er, null)).toBeUndefined();
    expect(withRelationKind(undefined, "dependency")).toEqual({ kind: "dependency" });
  });

  it("changes the notation and leaves the data alone, in both directions", () => {
    const crow = withNotation(er, "crows-foot")!;
    expect(crow.start).toEqual(er.start);
    expect(crow.end).toEqual(er.end);
    expect(withNotation(crow, "chen")).toEqual(er);
    expect(withNotation(er, null)).toEqual({ kind: "er-relationship", start: er.start, end: er.end });
    expect(withNotation(undefined, "chen")).toBeUndefined();
  });

  it("sets and clears the fields of one end, and starts an association when there is none", () => {
    expect(withEnd(er, "end", { cardinality: "zero-or-many" })!.end).toEqual({ cardinality: "zero-or-many" });
    expect(withEnd(er, "start", { role: undefined })!.start).toEqual({ cardinality: "one" });
    expect(withEnd(er, "start", { cardinality: undefined, role: undefined })!.start).toBeUndefined();
    expect(withEnd(undefined, "end", { multiplicity: "0..*" })).toEqual({ kind: "association", end: { multiplicity: "0..*" } });
    // A value the kind cannot show is dropped, never stored.
    expect(withEnd({ kind: "generalization" }, "end", { multiplicity: "1" })).toEqual({ kind: "generalization" });
    expect(withEnd({ kind: "association" }, "end", { multiplicity: "3.." })).toEqual({ kind: "association" });
  });
});
