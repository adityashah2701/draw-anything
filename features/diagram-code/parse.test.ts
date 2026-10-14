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
    const parsed = parseDiagramCode("A [wibble: 1, color: red, kind: api]");
    const warnings = parsed.issues.filter((i) => i.severity === "warning");
    expect(warnings.map((w) => w.message).join(" ")).toMatch(/wibble/);
    expect(warnings.map((w) => w.message).join(" ")).toMatch(/color/);
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
