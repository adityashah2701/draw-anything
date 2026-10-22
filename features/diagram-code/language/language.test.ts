import { describe, expect, it } from "vitest";
import { compileDiagramCode } from "./index";
import { textOf } from "./source";

const compile = (source: string) => compileDiagramCode(source);
const codes = (source: string) => compile(source).diagnostics.map((d) => d.code);

describe("diagnostics carry exact locations", () => {
  it("points at the offending token with line, column and range", () => {
    const source = "A [kind: api]\nB [wibble: 1, kind: api]";
    const [diagnostic] = compile(source).diagnostics;
    expect(diagnostic).toMatchObject({ code: "property/unknown", severity: "warning", line: 2, column: 4, endLine: 2, endColumn: 10 });
    expect(textOf(source, diagnostic.span)).toBe("wibble");
  });

  it("ranges always select the text the message is about", () => {
    const cases: Array<[string, string, string]> = [
      ["A [color: nope]", "property/invalid-value", "nope"],
      ["A [x: left]", "property/invalid-value", "left"],
      ["A [shape: blob]", "shape/unsupported", "blob"],
      ["A > B: [from: middle]", "property/invalid-value", "middle"],
      ["type banana\nA", "header/unknown-type", "banana"],
      ["A [kind: servise]", "reference/unknown-kind", "servise"],
      ["A --- B", "syntax/unknown-connector", "---"],
      ["A > A", "edge/self-loop", ">"],
    ];
    for (const [source, code, selected] of cases) {
      const found = compile(source).diagnostics.find((d) => d.code === code);
      expect(found, `${code} in ${JSON.stringify(source)}`).toBeDefined();
      expect(textOf(source, found!.span), code).toBe(selected);
    }
  });

  it("suggests the likely word for a typo", () => {
    const find = (source: string, code: string) => compile(source).diagnostics.find((d) => d.code === code)!;
    expect(find("A [colr: red]", "property/unknown").suggestion).toBe("color");
    expect(find("A [kind: servise]", "reference/unknown-kind").suggestion).toBe("service");
    expect(find("A [shape: diamnd]", "shape/unsupported").suggestion).toBe("diamond");
    expect(find("type flowchrt\nA", "header/unknown-type").suggestion).toBe("flowchart");
    expect(find("A > B: [from: rigth]", "property/invalid-value").suggestion).toBe("right");
  });

  it("tells the user what to use instead of an unsupported shape", () => {
    const [d] = compile("DB [shape: database]").diagnostics;
    expect(d.code).toBe("shape/unsupported");
    expect(d.message).toMatch(/kind: database/);
  });

  it("reports unknown icons, but accepts library icons without loading the library", () => {
    expect(codes("A [icon: postgres]")).toEqual([]);
    expect(codes("A [icon: calendar-check]")).toEqual([]); // library icon, catalog only
    expect(codes("A [icon: logo-github]")).toEqual([]); // logos cannot be checked cheaply: not reported
    const [d] = compile("A [icon: databse]").diagnostics;
    expect(d).toMatchObject({ code: "reference/unknown-icon", suggestion: "database" });
  });

  it("warns about a bare-icon shape with nothing to draw", () => {
    expect(codes("A [shape: icon]")).toEqual(["shape/needs-icon"]);
    expect(codes("A [shape: icon, icon: database]")).toEqual([]);
    expect(codes("A [shape: icon, kind: database]")).toEqual([]);
  });

  it("flags properties on the wrong kind of element and repeated properties", () => {
    expect(codes("Team [kind: api] {\n A\n}")).toEqual(["property/not-for-element"]);
    expect(codes("A [color: red, color: blue]")).toEqual(["property/duplicate"]);
    expect(codes("A [dashed: maybe]")).toEqual(["property/invalid-value"]);
  });

  it("reports an unclosed block at the name that opened it, and a stray }", () => {
    const source = "A\nTeam {\n  B\n";
    const [open] = compile(source).diagnostics;
    expect(open).toMatchObject({ code: "syntax/unclosed-block", line: 2 });
    expect(textOf(source, open.span)).toBe("Team");
    expect(codes("A\n}\nB")).toEqual(["syntax/unmatched-close"]);
  });

  it("marks code with any error invalid and code with only warnings valid", () => {
    expect(compile("A > B").valid).toBe(true);
    expect(compile("A [wibble: 1]").valid).toBe(true);
    expect(compile("A [kind: api").valid).toBe(false);
  });

  it("uses CRLF line endings without shifting columns", () => {
    const source = "A\r\nB [wibble: 1]\r\n";
    const [d] = compile(source).diagnostics;
    expect(d).toMatchObject({ line: 2, column: 4 });
    expect(textOf(source, d.span)).toBe("wibble");
  });
});

describe("frames", () => {
  const code = `frame Platform [padding: 32, color: blue, x: 10, y: 20, w: 600, h: 400] {
  API [kind: api]
  Data {
    DB [kind: database]
  }
  frame Inner {
    Cache [kind: cache]
  }
}
Client > API`;

  it("resolves frames with their geometry, nesting and members", () => {
    const { ir, valid, diagnostics } = compile(code);
    expect(diagnostics).toEqual([]);
    expect(valid).toBe(true);
    expect(ir.frames.map((f) => [f.name, f.parent?.id])).toEqual([["Platform", undefined], ["Inner", "platform"]]);
    expect(ir.frames[0]).toMatchObject({ title: "Platform", padding: 32, color: "#2563eb", x: 10, y: 20, width: 600, height: 400 });
    expect(ir.groups).toEqual([expect.objectContaining({ name: "Data", parent: { type: "frame", id: "platform" } })]);
    const parent = new Map(ir.nodes.map((n) => [n.name, n.parent]));
    expect(parent.get("API")).toEqual({ type: "frame", id: "platform" });
    expect(parent.get("DB")).toEqual({ type: "group", id: "data" });
    expect(parent.get("Cache")).toEqual({ type: "frame", id: "inner" });
    expect(parent.get("Client")).toBeUndefined();
  });

  it("keeps frames out of the group list and exposes them separately in the compatibility shape", async () => {
    const { parseDiagramCode } = await import("../parse");
    const parsed = parseDiagramCode(code);
    expect(parsed.groups.map((g) => g.label)).toEqual(["Data"]);
    expect(parsed.groups[0].parentId).toBeUndefined();
    const platform = parsed.frames.find((f) => f.title === "Platform")!;
    const names = new Map(parsed.nodes.map((n) => [n.id, n.name]));
    expect(platform.nodeIds.map((id) => names.get(id))).toEqual(["API", "DB", "Cache"]);
    expect(parsed.frames.find((f) => f.title === "Inner")!.parentId).toBe(platform.id);
  });

  it("rejects a frame inside a group", () => {
    const source = "Team {\n  frame Box {\n    A\n  }\n}";
    const [d] = compile(source).diagnostics;
    expect(d).toMatchObject({ code: "nesting/frame-in-group", severity: "error", line: 2 });
    expect(textOf(source, d.span)).toBe("frame");
  });

  it("takes the title from label, and frame/group are only keywords before a name and a brace", () => {
    expect(compile('frame f [label: "Public edge"] {\n A\n}').ir.frames[0].title).toBe("Public edge");
    expect(compile("frame {\n A\n}").ir.groups.map((g) => g.name)).toEqual(["frame"]);
    expect(compile('"frame x" {\n A\n}').ir.groups.map((g) => g.name)).toEqual(["frame x"]);
    expect(compile("frame x\ngroup y").ir.nodes.map((n) => n.name)).toEqual(["frame x", "group y"]);
    expect(compile("group Team {\n A\n}").ir.groups.map((g) => g.name)).toEqual(["Team"]);
  });

  it("closes an empty block written on one line", () => {
    const { ir, diagnostics } = compile("frame Empty {}\nTeam { }\nA");
    expect(diagnostics).toEqual([]);
    expect(ir.frames.map((f) => f.name)).toEqual(["Empty"]);
    expect(ir.groups.map((g) => g.name)).toEqual(["Team"]);
    expect(ir.nodes.find((n) => n.name === "A")!.parent).toBeUndefined();
  });

  it("validates frame properties", () => {
    expect(codes("frame F [padding: 9999] {\n A\n}")).toEqual(["property/out-of-range"]);
    expect(codes("frame F [kind: api] {\n A\n}")).toEqual(["property/not-for-element"]);
    expect(codes("frame F [shape: diamond] {\n A\n}")).toEqual(["property/not-for-element"]);
  });

  it("reports an unclosed frame", () => {
    expect(compile("frame F {\n A\n").diagnostics[0]).toMatchObject({ code: "syntax/unclosed-block", message: expect.stringMatching(/frame "F"/) });
  });
});

describe("highlighting tokens and references", () => {
  it("classifies the parts of a line, even when the line is broken", () => {
    const source = 'API [kind: api, label: "Gateway", w: 120] > DB: SQL // note';
    const kinds = compile(source).tokens.map((t) => [t.kind, textOf(source, t.span)]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["name", "API"],
        ["property", "kind"],
        ["value", "api"],
        ["string", '"Gateway"'],
        ["number", "120"],
        ["connector", ">"],
        ["label", "SQL"],
        ["comment", "// note"],
      ]),
    );
    expect(() => compile("A [kind: ").tokens).not.toThrow();
    expect(compile("A [kind: ").tokens.some((t) => t.kind === "property")).toBe(true);
  });

  it("tokens never overlap and stay in source order", () => {
    const source = 'title T\nA [kind: api] > B, C: x [color: red]\nframe F [w: 100] {\n  D // c\n}\n# whole';
    const { tokens } = compile(source);
    for (let i = 1; i < tokens.length; i += 1) expect(tokens[i].span.start).toBeGreaterThanOrEqual(tokens[i - 1].span.end);
  });

  it("records every mention of a node, marking the first as the definition", () => {
    const { references, ir } = compile("A > B\nB > A");
    const a = ir.nodes.find((n) => n.name === "A")!.id;
    const ofA = references.filter((r) => r.id === a);
    expect(ofA.map((r) => r.definition)).toEqual([true, false]);
  });
});

describe("robustness", () => {
  it("never throws and never produces ranges outside the text, for mutated programs", () => {
    const seed = 'title T\ntype flowchart\nfrontend [kind: user] {\n  A [kind: api, x: 1, y: 2]\n}\nframe F [padding: 8] {\n  B\n}\nA > B: "hi" [color: red, from: top]\nA <> B, C -- D // c\n# note\n';
    let state = 12345;
    const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet = ['"', "[", "]", "{", "}", ",", ":", ">", "<", "-", " ", "\n", "/", "#", "\\", "x"];
    for (let round = 0; round < 400; round += 1) {
      let text = seed;
      for (let m = 0; m < 1 + Math.floor(random() * 6); m += 1) {
        const at = Math.floor(random() * text.length);
        const piece = alphabet[Math.floor(random() * alphabet.length)];
        text = random() < 0.5 ? text.slice(0, at) + piece + text.slice(at) : text.slice(0, at) + text.slice(at + 1 + Math.floor(random() * 3));
      }
      const result = compile(text);
      for (const d of result.diagnostics) {
        expect(d.span.start).toBeGreaterThanOrEqual(0);
        expect(d.span.end).toBeLessThanOrEqual(text.length);
        expect(d.line).toBeGreaterThanOrEqual(1);
      }
      for (let i = 1; i < result.tokens.length; i += 1) expect(result.tokens[i].span.start).toBeGreaterThanOrEqual(result.tokens[i - 1].span.end);
    }
  });

  it("scales linearly: 1,500 lines compile quickly", () => {
    const source = Array.from({ length: 1_500 }, (_, i) => `N${i} [kind: service] > N${i + 1}: link [color: blue]`).join("\n");
    const started = performance.now();
    const result = compile(source);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(result.ir.nodes.length).toBe(1_501);
  });
});

describe("quoted strings", () => {
  it("reads \\n as a line break, \\\" as a quote and \\\\ as a backslash; other backslashes stay", () => {
    const { ir } = compile('A [label: "a\\nb \\"q\\" c\\\\d e\\tf"]\nB > C: "x\\ny"');
    expect(ir.nodes[0].label).toBe('a\nb "q" c\\d e\\tf');
    expect(ir.edges[0].label).toBe("x\ny");
  });

  it("does not end a string at an escaped quote, so a // inside it is not a comment", () => {
    expect(compile('A [label: "he said \\"hi // there\\""]').ir.nodes[0].label).toBe('he said "hi // there"');
  });
});
