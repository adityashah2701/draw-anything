import { describe, expect, it } from "vitest";
import { parseDiagramCode } from "./parse";

const byName = (code: string) => {
  const parsed = parseDiagramCode(code);
  const nodes = new Map(parsed.nodes.map((n) => [n.label, n]));
  return { parsed, nodes };
};
const edgePairs = (code: string) => {
  const { parsed } = byName(code);
  const label = new Map(parsed.nodes.map((n) => [n.id, n.label]));
  return parsed.edges.map((e) => [label.get(e.from), label.get(e.to)]);
};
const errors = (code: string) =>
  parseDiagramCode(code).issues.filter((i) => i.severity === "error");

describe("parseDiagramCode – nodes", () => {
  it("declares nodes with properties", () => {
    const { parsed, nodes } = byName(`
      Client [kind: browser]
      API Gateway [kind: gateway, label: "Public API"]
      Database [kind: database, dashed: true]
    `);
    expect(parsed.issues).toEqual([]);
    expect(nodes.get("Client")).toMatchObject({ kind: "browser" });
    expect(parsed.nodes.map((n) => n.label)).toEqual(["Client", "Public API", "Database"]);
    expect(parsed.nodes[1]).toMatchObject({ name: "API Gateway", kind: "gateway" });
    expect(parsed.nodes[2].dashed).toBe(true);
  });

  it("accepts several comma separated declarations on one line", () => {
    const { parsed } = byName("Client, Server [kind: service], Cache [kind: cache]");
    expect(parsed.nodes.map((n) => [n.label, n.kind])).toEqual([
      ["Client", undefined],
      ["Server", "service"],
      ["Cache", "cache"],
    ]);
  });

  it("gives every node a unique id, even when names slug alike", () => {
    const { parsed } = byName('"A B"\n"A-B"\n"a b"');
    expect(new Set(parsed.nodes.map((n) => n.id)).size).toBe(3);
  });

  it("ignores comments and blank lines, and keeps # and // inside quotes", () => {
    const { parsed } = byName(`
      // a comment
      # another
      "C#" [kind: service] // trailing comment
      "see http://x" [kind: api]
    `);
    expect(parsed.issues).toEqual([]);
    expect(parsed.nodes.map((n) => n.name)).toEqual(["C#", "see http://x"]);
  });

  it("does not treat // inside a URL label as a comment", () => {
    const { parsed } = byName("A > B: https://api.example.com/v1 // trailing note");
    expect(parsed.edges[0].label).toBe("https://api.example.com/v1");
  });

  it("keeps the first declaration of a duplicate name and warns", () => {
    const parsed = parseDiagramCode("A [kind: api]\nA [kind: database]");
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].kind).toBe("database"); // later properties merge in
    expect(parsed.issues.some((i) => i.severity === "warning" && i.line === 2)).toBe(true);
  });
});

describe("parseDiagramCode – edges", () => {
  it("supports > < <> and dashed variants", () => {
    const parsed = parseDiagramCode(`
      A > B
      C < D
      E <> F
      G --> H
      I <--> J
    `);
    const ids = new Map(parsed.nodes.map((n) => [n.id, n.label]));
    const edges = parsed.edges.map((e) => ({
      from: ids.get(e.from),
      to: ids.get(e.to),
      bi: Boolean(e.bidirectional),
      dashed: Boolean(e.dashed),
    }));
    expect(edges).toEqual([
      { from: "A", to: "B", bi: false, dashed: false },
      { from: "D", to: "C", bi: false, dashed: false }, // "<" points the other way
      { from: "E", to: "F", bi: true, dashed: false },
      { from: "G", to: "H", bi: false, dashed: true },
      { from: "I", to: "J", bi: true, dashed: true },
    ]);
    expect(parsed.issues).toEqual([]);
  });

  it("fans out and chains", () => {
    expect(edgePairs("A > B, C, D")).toEqual([["A", "B"], ["A", "C"], ["A", "D"]]);
    expect(edgePairs("A > B > C")).toEqual([["A", "B"], ["B", "C"]]);
    expect(edgePairs("A, B > C")).toEqual([["A", "C"], ["B", "C"]]);
  });

  it("puts a label after a colon on every edge of the line", () => {
    const { parsed } = byName("Client > API, Worker: HTTPS");
    expect(parsed.edges.map((e) => e.label)).toEqual(["HTTPS", "HTTPS"]);
  });

  it("does not mistake property colons for labels", () => {
    const { parsed } = byName("A [kind: api] > B [kind: database]: SQL");
    expect(parsed.edges[0].label).toBe("SQL");
    expect(parsed.nodes.map((n) => n.kind)).toEqual(["api", "database"]);
  });

  it("creates nodes that are only mentioned in an edge", () => {
    const { parsed } = byName("A > B");
    expect(parsed.nodes.map((n) => n.label)).toEqual(["A", "B"]);
  });

  it("allows > inside a name when it has no surrounding spaces or is quoted", () => {
    const { parsed } = byName('"A > B" > C\nx>y');
    expect(parsed.nodes.map((n) => n.name)).toEqual(["A > B", "C", "x>y"]);
    expect(parsed.edges).toHaveLength(1);
  });

  it("drops a self-loop with a warning", () => {
    const parsed = parseDiagramCode("A > A");
    expect(parsed.edges).toHaveLength(0);
    expect(parsed.issues.some((i) => i.severity === "warning")).toBe(true);
  });
});

describe("parseDiagramCode – groups", () => {
  it("collects member nodes and nests groups", () => {
    const { parsed } = byName(`
      Backend {
        API
        Workers {
          Queue
          Worker
        }
      }
      Client
      Client > API
    `);
    expect(parsed.issues).toEqual([]);
    const label = new Map(parsed.nodes.map((n) => [n.id, n.label]));
    const members = (name: string) =>
      parsed.groups.find((g) => g.label === name)!.nodeIds.map((id) => label.get(id)).sort();
    expect(members("Backend")).toEqual(["API", "Queue", "Worker"]); // includes descendants
    expect(members("Workers")).toEqual(["Queue", "Worker"]);
    expect(parsed.groups.find((g) => g.label === "Workers")!.parentId).toBe(
      parsed.groups.find((g) => g.label === "Backend")!.id,
    );
  });

  it("puts nodes first mentioned in an edge inside the current group", () => {
    const { parsed } = byName(`
      Team {
        A > B
      }
    `);
    expect(parsed.groups[0].nodeIds).toHaveLength(2);
  });

  it("supports a group label property", () => {
    const { parsed } = byName('g [label: "Production"] {\n A\n}');
    expect(parsed.groups[0].label).toBe("Production");
  });
});

describe("parseDiagramCode – header directives", () => {
  it("reads title, type and direction before the first node", () => {
    const parsed = parseDiagramCode(`
      title Order flow
      type flowchart
      direction right
      A > B
    `);
    expect(parsed).toMatchObject({ title: "Order flow", diagramType: "flowchart", direction: "right" });
    expect(parsed.issues).toEqual([]);
  });

  it("treats the same words as node names once the body has started", () => {
    const { parsed } = byName("A > B\ntitle Service\ntype checker");
    expect(parsed.title).toBeUndefined();
    expect(parsed.nodes.map((n) => n.name)).toEqual(["A", "B", "title Service", "type checker"]);
  });

  it("warns about an unknown diagram type instead of failing", () => {
    const parsed = parseDiagramCode("type banana\nA > B");
    expect(parsed.diagramType).toBeUndefined();
    expect(parsed.issues.some((i) => i.severity === "warning" && i.line === 1)).toBe(true);
    expect(parsed.edges).toHaveLength(1);
  });
});

describe("parseDiagramCode – errors carry line numbers", () => {
  it("reports an unclosed group at the line that opened it", () => {
    const issues = errors("A\nTeam {\n  B\n");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ line: 2 });
    expect(issues[0].message).toMatch(/never closed/i);
  });

  it("reports an unmatched }", () => {
    expect(errors("A\n}\nB")[0]).toMatchObject({ line: 2 });
  });

  it("reports an unterminated property list and an empty name", () => {
    expect(errors("A [kind: api")[0]).toMatchObject({ line: 1 });
    expect(errors("A > ")[0]).toMatchObject({ line: 1 });
    expect(errors(" > B")[0]).toMatchObject({ line: 1 });
  });

  it("warns about unknown property keys and unsupported ones", () => {
    const parsed = parseDiagramCode("A [wibble: 1, colorMode: bold, kind: api]");
    const warnings = parsed.issues.filter((i) => i.severity === "warning");
    expect(warnings.map((w) => w.message).join(" ")).toMatch(/wibble/);
    expect(warnings.map((w) => w.message).join(" ")).toMatch(/colormode/);
    expect(parsed.nodes[0].kind).toBe("api");
  });

  it("never throws on garbage and keeps whatever it understood", () => {
    const junk = ["", "{{{{", "}}}}", "[[[", "> > >", ":::", '"', "A [", "\u0000\u0001", "A >", "<> B"];
    for (const code of junk) expect(() => parseDiagramCode(code)).not.toThrow();
    const parsed = parseDiagramCode("A > B\n{{{\nC > D");
    expect(parsed.edges.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses absurdly large input without hanging", () => {
    const parsed = parseDiagramCode("A > B\n".repeat(50_000));
    expect(parsed.issues.some((i) => i.severity === "error")).toBe(true);
  });
});

describe("Eraser-style lines, shapes and colours", () => {
  it("reads - and -- as lines without an arrowhead (--  is dotted)", () => {
    const parsed = parseDiagramCode("A - B\nB -- C");
    expect(parsed.nodes.map((n) => n.name)).toEqual(["A", "B", "C"]);
    expect(parsed.edges).toMatchObject([
      { plain: true, dashed: undefined },
      { plain: true, dashed: true },
    ]);
  });

  it("keeps --> a dotted arrow, not a dotted line", () => {
    expect(parseDiagramCode("A --> B").edges[0]).toMatchObject({ dashed: true, plain: undefined });
  });

  it("takes a trailing [color: x] off the label and onto the edge", () => {
    const [labelled] = parseDiagramCode("A > B: Triage [color: green]").edges;
    expect(labelled).toMatchObject({ label: "Triage", color: "#16a34a" });
    const [bare] = parseDiagramCode("A > B: [color: #f00]").edges;
    expect(bare.label).toBeUndefined();
    expect(bare.color).toBe("#ff0000");
  });

  it("leaves brackets that are not a colour in the label", () => {
    expect(parseDiagramCode("A > B: GET [v2]").edges[0].label).toBe("GET [v2]");
  });

  it("supports node shape: diamond and color, and warns about the rest", () => {
    const parsed = parseDiagramCode('A [shape: diamond, color: blue]\nB [shape: star, color: "url(x)"]\nC [shape: rectangle]');
    expect(parsed.nodes[0]).toMatchObject({ shape: "diamond", color: "#2563eb" });
    expect(parsed.nodes[1].shape).toBeUndefined();
    expect(parsed.nodes[1].color).toBeUndefined();
    expect(parsed.nodes[2].shape).toBeUndefined();
    const messages = parsed.issues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(/star/);
    expect(messages).toMatch(/not recognised/);
    expect(parsed.issues).toHaveLength(2);
  });
});

describe("Eraser-style syntax: edge cases", () => {
  const messages = (src: string) => parseDiagramCode(src).issues.map((i) => i.message);

  it("keeps a malformed edge colour as label text and says so", () => {
    for (const src of ["A > B: hi [color: red", "A > B: hi [color red]"]) {
      const parsed = parseDiagramCode(src);
      expect(parsed.edges).toHaveLength(1);
      expect(parsed.edges[0].color).toBeUndefined();
      expect(parsed.edges[0].label).toContain("hi [color");
      expect(parsed.issues.map((i) => i.message).join(" ")).toMatch(/looks like an edge color/);
    }
  });

  it("ignores an unknown or empty edge colour with a warning and keeps the label", () => {
    const bad = parseDiagramCode("A > B: hi [color: nope]");
    expect(bad.edges[0]).toMatchObject({ label: "hi", color: undefined });
    expect(bad.issues).toHaveLength(1);
    const empty = parseDiagramCode("A > B: [color: ]");
    expect(empty.edges[0].label).toBeUndefined();
    expect(empty.issues).toHaveLength(1);
  });

  it("treats [color] right after a node as that node's colour, not the connection's", () => {
    const parsed = parseDiagramCode("A > B [color: red]");
    expect(parsed.nodes.find((n) => n.name === "B")?.color).toBe("#dc2626");
    expect(parsed.edges[0].color).toBeUndefined();
  });

  it("accepts hex in either case and short form, and names in any case", () => {
    const parsed = parseDiagramCode('A [color: #ABCDEF]\nB [color: #FA0]\nC [color: " BLUE "]');
    expect(parsed.nodes.map((n) => n.color)).toEqual(["#abcdef", "#ffaa00", "#2563eb"]);
    expect(parsed.issues).toEqual([]);
  });

  it("rejects bad colours with exactly one warning each, including functions with commas", () => {
    for (const src of ["A [color: #12345]", "A [color: rgb(1,2,3)]", "A [color: url(x)]"]) {
      const parsed = parseDiagramCode(src);
      expect(parsed.nodes[0].color).toBeUndefined();
      expect(parsed.issues).toHaveLength(1);
    }
  });

  it("reads shape case-insensitively; a later unsupported shape does not undo an earlier one", () => {
    expect(parseDiagramCode("A [shape: DIAMOND]").nodes[0].shape).toBe("diamond");
    const parsed = parseDiagramCode("A [shape: diamond]\nA [shape: star]");
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].shape).toBe("diamond");
  });

  it.each(["star", "blob", "octagon"])("reports shape %s once and still declares the node", (shape) => {
    const parsed = parseDiagramCode(`Thing [shape: ${shape}, icon: database]`);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({ name: "Thing", icon: "database" });
    expect(parsed.nodes[0].shape).toBeUndefined();
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].message).toContain(shape);
  });

  it("still ignores colorMode with a warning (regression)", () => {
    const parsed = parseDiagramCode("A [colorMode: bold]");
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.issues.map((i) => i.message).join(" ")).toMatch(/colormode/);
  });

  it("warns about a connector-like token it does not know instead of silently making a strange node", () => {
    expect(messages("A --- B").join(" ")).toMatch(/"---" is not a connector/);
    expect(messages("A <-> B").join(" ")).toMatch(/"<->" is not a connector/);
    expect(parseDiagramCode("A --- B").nodes.map((n) => n.name)).toEqual(["A --- B"]);
    expect(messages('"A --- B" > C')).toEqual([]);
  });

  it("leaves hyphens inside names, quoted names and labels alone", () => {
    expect(parseDiagramCode("Sign-up > Home").nodes.map((n) => n.name)).toEqual(["Sign-up", "Home"]);
    expect(parseDiagramCode("A > B: well - maybe").edges[0].label).toBe("well - maybe");
    const quoted = parseDiagramCode('"Read - Write" > C');
    expect(quoted.nodes.map((n) => n.name)).toEqual(["Read - Write", "C"]);
    expect(quoted.issues).toEqual([]);
  });

  it("reports a dangling connector with its line number", () => {
    expect(parseDiagramCode("A > B\nA -").issues).toEqual([expect.objectContaining({ line: 2, severity: "error" })]);
    expect(parseDiagramCode("- > B").issues.every((i) => i.severity === "error" && i.line === 1)).toBe(true);
  });

  it("chains and branches with lines, keeping each link's own style", () => {
    const parsed = parseDiagramCode("A - B -- C > D");
    expect(parsed.edges.map((e) => [e.plain, e.dashed])).toEqual([
      [true, undefined],
      [true, true],
      [undefined, undefined],
    ]);
    expect(parseDiagramCode("A - B, C").edges).toHaveLength(2);
  });
});

describe("pill shape", () => {
  it.each(["pill", "PILL", "oval", "ellipse"])("reads shape: %s as a pill, without a warning", (shape) => {
    const parsed = parseDiagramCode(`Begin [shape: ${shape}]`);
    expect(parsed.nodes[0].shape).toBe("pill");
    expect(parsed.issues).toEqual([]);
  });

  it("accepts start and end as kinds", () => {
    const parsed = parseDiagramCode("Go [kind: start]\nStop [kind: end]\nGo > Stop");
    expect(parsed.nodes.map((n) => n.kind)).toEqual(["start", "end"]);
    expect(parsed.issues).toEqual([]);
  });
});

describe("layout properties: position, size and connection sides", () => {
  it("reads x, y, w and h on a node (width and height are aliases)", () => {
    const { nodes, issues } = parseDiagramCode("API [x: 120, y: -40, w: 200, h: 80]\nDB [x: 10.55, width: 90, height: 60]");
    expect(issues).toEqual([]);
    expect(nodes[0]).toMatchObject({ x: 120, y: -40, width: 200, height: 80 });
    expect(nodes[1]).toMatchObject({ x: 10.6, width: 90, height: 60 });
  });

  it("ignores a number that is not a number or is out of range, and says so", () => {
    const parsed = parseDiagramCode('A [x: left, y: 9999999, w: 5, h: 100000]');
    expect(parsed.nodes[0].x).toBeUndefined();
    expect(parsed.nodes[0].y).toBeUndefined();
    expect(parsed.nodes[0].width).toBeUndefined();
    expect(parsed.nodes[0].height).toBeUndefined();
    expect(parsed.issues.filter((i) => i.severity === "warning")).toHaveLength(4);
  });

  it("reads the sides a connection leaves and enters by, with or without a label", () => {
    const parsed = parseDiagramCode("A > B: HTTPS [from: right, to: left]\nB > C: [from: bottom, to: top, color: red]");
    expect(parsed.issues).toEqual([]);
    expect(parsed.edges[0]).toMatchObject({ label: "HTTPS", fromSide: "right", toSide: "left" });
    expect(parsed.edges[1]).toMatchObject({ label: undefined, fromSide: "bottom", toSide: "top", color: "#dc2626" });
  });

  it("swaps the sides together with the ends of a reversed connection", () => {
    const parsed = parseDiagramCode("A < B: [from: right, to: left]");
    expect(parsed.edges[0]).toMatchObject({ from: parsed.nodes.find((n) => n.name === "B")!.id, fromSide: "left", toSide: "right" });
  });

  it("warns about a side that is not one, and keeps square brackets in a label that are not properties", () => {
    const bad = parseDiagramCode("A > B: [from: middle]");
    expect(bad.edges[0].fromSide).toBeUndefined();
    expect(bad.issues.map((i) => i.message).join(" ")).toMatch(/not a side/);
    const label = parseDiagramCode("A > B: rows[0] and [1]");
    expect(label.edges[0].label).toBe("rows[0] and [1]");
    expect(label.issues).toEqual([]);
  });
});
