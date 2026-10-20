import { describe, expect, it } from "vitest";
import { compileDiagramCode } from "../compile";
import { completeAt, inHeaderAt } from "./complete";
import { toSegments } from "./highlight";
import { hoverAt } from "./hover";
import { enter, tab, typeCloseBrace } from "./indent";

/** `|` marks the cursor. */
const at = (marked: string) => ({ source: marked.replace("|", ""), offset: marked.indexOf("|") });
const complete = (marked: string, names: string[] = ["API", "Order Service", "DB"]) => {
  const { source, offset } = at(marked);
  const compiled = compileDiagramCode(source);
  const inHeader = inHeaderAt(compiled, source, offset);
  const result = completeAt(source, offset, { nodeNames: names, iconIds: ["database", "postgres", "browser", "calendar-check"], inHeader });
  return result && { ...result, labels: result.items.map((i) => i.label), text: source.slice(result.from, result.to) };
};

describe("completion", () => {
  it("offers property names inside brackets, skipping the ones already written", () => {
    const result = complete("API [kind: api, ic|");
    expect(result?.labels).toEqual(["icon"]);
    expect(result?.items[0].insert).toBe("icon: ");
    expect(complete("API [|")?.labels).toEqual(expect.arrayContaining(["kind", "icon", "shape", "color", "x", "w", "label"]));
    expect(complete("API [kind: api, |")?.labels).not.toContain("kind");
  });

  it("offers values for the property being typed", () => {
    expect(complete("A [kind: dat|")?.labels).toEqual(["database"]);
    expect(complete("A [shape: di|")?.labels).toEqual(["diamond"]);
    expect(complete("A [color: bl|")?.labels).toEqual(expect.arrayContaining(["blue", "black"]));
    expect(complete("A [dashed: |")?.labels).toEqual(["true", "false"]);
    expect(complete("A [icon: cal|")?.labels).toEqual(["calendar-check"]);
    expect(complete("A [icon: post|")?.labels).toEqual(["postgres"]);
  });

  it("replaces just the word being typed, including the rest of it after the cursor", () => {
    const result = complete("A [kind: da|tabase]");
    expect(result?.text).toBe("database"); // the whole word, so accepting does not leave a tail behind
    expect(complete("A [kind: dat|")?.from).toBe("A [kind: ".length);
  });

  it("offers edge properties after a connection label and node properties before", () => {
    expect(complete("A > B: hi [fr|")?.labels).toEqual(["from"]);
    expect(complete("A > B: hi [from: |")?.labels).toEqual(["top", "right", "bottom", "left"]);
    expect(complete("A > B [fr|")).toBeNull(); // node B has no `from`
  });

  it("knows frames and groups take different properties", () => {
    expect(complete("frame F [pad|")?.labels).toEqual(["padding"]);
    expect(complete("Team [pad|")).toBeNull();
  });

  it("offers existing nodes after a connector or comma, quoting names that need it", () => {
    expect(complete("A > |")?.labels).toEqual(["API", "Order Service", "DB"]);
    expect(complete("A > Or|")?.items[0]).toMatchObject({ label: "Order Service", insert: "Order Service" });
    expect(complete("A > B, D|")?.labels[0]).toBe("DB");
    expect(complete("A > |", ["x > y"])?.items[0].insert).toBe('"x > y"');
  });

  it("offers keywords and header lines at the start of a line, headers only in the header", () => {
    expect(complete("fr|")?.labels).toContain("frame");
    expect(complete("ti|")?.labels).toContain("title");
    expect(complete("A\nti|")?.labels ?? []).not.toContain("title");
    expect(complete("type |")?.labels).toEqual(expect.arrayContaining(["flowchart", "architecture"]));
    expect(complete("direction |")?.labels).toEqual(["down", "right"]);
  });

  it("offers connectors and a property list after a finished name", () => {
    const result = complete("API |");
    expect(result?.labels).toEqual(expect.arrayContaining([">", "<>", "-->", "["]));
  });

  it("stays quiet inside strings, comments and connection labels", () => {
    expect(complete('A [label: "he|')).toBeNull();
    expect(complete("A // not |")).toBeNull();
    expect(complete("# no|")).toBeNull();
    expect(complete("A > B: la|bel")).toBeNull();
    expect(complete("A [kind: |", [])?.labels.length).toBeGreaterThan(10);
  });
});

describe("hover", () => {
  const hover = (marked: string) => {
    const { source, offset } = at(marked);
    return hoverAt(compileDiagramCode(source), offset);
  };

  it("documents a property key with an example", () => {
    const h = hover("API [ki|nd: api]");
    expect(h?.title).toBe("kind");
    expect(h?.lines.join(" ")).toMatch(/Example: `kind: database`/);
  });

  it("describes values: kind, icon (with alias), shape, colour", () => {
    expect(hover("A [kind: da|tabase]")?.lines[0]).toMatch(/Kind `database`/);
    expect(hover("A [icon: post|gres]")?.lines[0]).toMatch(/Icon `database`.*alias/);
    expect(hover("A [shape: dia|mond]")?.lines[0]).toMatch(/decision/i);
    expect(hover("A [color: bl|ue]")?.lines[0]).toBe("Colour #2563eb.");
  });

  it("summarises a node by name: kind, connections, container", () => {
    const h = hover("Team {\n  API [kind: api]\n}\nWeb > AP|I\nAPI > DB");
    expect(h?.title).toBe("API");
    expect(h?.lines.join(" ")).toMatch(/Kind api\. 2 connections\./);
    expect(h?.lines.join(" ")).toMatch(/Inside group "Team"/);
  });

  it("explains connectors and keywords, and attaches diagnostics", () => {
    expect(hover("A <|> B")?.lines[0]).toMatch(/both ends/);
    expect(hover("fra|me F {\n}")?.lines[0]).toMatch(/titled container/);
    const bad = hover("A [wibb|le: 1]");
    expect(bad?.diagnostics[0].code).toBe("property/unknown");
  });

  it("returns nothing over whitespace", () => {
    expect(hover("A   |  > B")).toBeNull();
  });
});

describe("highlight segments", () => {
  it("cover the source exactly once and mark errors", () => {
    const source = 'title T\nAPI [kind: api, wibble: 1] > DB: "x" // c\nTeam {\n';
    const compiled = compileDiagramCode(source);
    const segments = toSegments(source, compiled.tokens, compiled.diagnostics);
    expect(segments.map((s) => s.text).join("")).toBe(source);
    const wibble = segments.find((s) => s.text === "wibble");
    expect(wibble).toMatchObject({ kind: "property", severity: "warning" });
    expect(segments.some((s) => s.severity === "error")).toBe(true); // the unclosed Team
    expect(segments.find((s) => s.text === ">")?.kind).toBe("connector");
  });

  it("handles empty input and broken input", () => {
    expect(toSegments("", [], [])).toEqual([]);
    const source = 'A [kind: "';
    const compiled = compileDiagramCode(source);
    expect(toSegments(source, compiled.tokens, compiled.diagnostics).map((s) => s.text).join("")).toBe(source);
  });
});

describe("indent helpers", () => {
  it("Enter keeps the indentation and goes deeper after {", () => {
    expect(enter("  A", 3, 3)).toEqual({ text: "  A\n  ", from: 6, to: 6 });
    expect(enter("Team {", 6, 6)).toEqual({ text: "Team {\n  ", from: 9, to: 9 });
    expect(enter("Team { // x", 11, 11).text).toBe("Team { // x\n  ");
  });

  it("Enter between braces puts the closing brace on its own line", () => {
    const result = enter("Team {}", 6, 6);
    expect(result.text).toBe("Team {\n  \n}");
    expect(result.from).toBe(9);
  });

  it("Tab indents, Tab on a selection indents each line, Shift+Tab outdents", () => {
    expect(tab("A", 1, 1, false)).toEqual({ text: "A  ", from: 3, to: 3 });
    expect(tab("A\nB\nC", 0, 3, false).text).toBe("  A\n  B\nC");
    expect(tab("  A\n    B", 0, 9, true).text).toBe("A\n  B");
    expect(tab("A", 1, 1, true).text).toBe("A");
  });

  it("typing } at the start of an indented line steps back a level", () => {
    expect(typeCloseBrace("Team {\n  A\n  ", 13)?.text).toBe("Team {\n  A\n}");
    expect(typeCloseBrace("A ", 2)).toBeNull();
  });
});

import { mapCaret } from "./caret";

describe("mapCaret", () => {
  it("keeps the caret on the same word when whitespace changes", () => {
    const before = "A   >   B";
    const after = "A > B";
    expect(after.slice(0, mapCaret(before, before.indexOf("B"), after))).toBe("A > ");
    expect(mapCaret(before, 0, after)).toBe(0);
    expect(mapCaret(before, before.length, after)).toBe(after.length);
    expect(mapCaret("", 0, "x")).toBe(0);
  });
});
