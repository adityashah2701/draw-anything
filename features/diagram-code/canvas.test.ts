import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { elementsFromDiagramCode, graphFromElements } from "./canvas";
import { parseDiagramCode } from "./parse";
import { serializeDiagramCode } from "./serialize";

const SHOP = `
type architecture
title Shop

Backend {
  API [kind: api]
  Orders [kind: service]
  Orders DB [kind: database]
}
Web App [kind: browser]

Web App > API: HTTPS
API > Orders
Orders --> Orders DB: SQL
`;
const compile = (code: string, generationId = "gen-1") =>
  elementsFromDiagramCode(code, { generationId, frameId: "frame-1" });

const meaning = (code: string) => {
  const p = parseDiagramCode(code);
  const label = new Map(p.nodes.map((n) => [n.id, n.label]));
  return {
    nodes: p.nodes.map((n) => `${n.label}:${n.kind ?? ""}`).sort(),
    edges: p.edges.map((e) => `${label.get(e.from)}>${label.get(e.to)}|${e.label ?? ""}|${e.dashed ? "d" : ""}`).sort(),
    groups: p.groups.map((g) => `${g.label}=[${g.nodeIds.map((id) => label.get(id)).sort()}]`).sort(),
  };
};

describe("elementsFromDiagramCode", () => {
  it("draws nodes, connectors, group frames and connector labels", () => {
    const { elements, issues } = compile(SHOP);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(elements.filter((e) => e.type === "semantic-node").map((e) => e.label).sort()).toEqual([
      "API", "Orders", "Orders DB", "Web App",
    ]);
    expect(elements.filter((e) => e.type === "arrow")).toHaveLength(3);
    expect(elements.filter((e) => e.ai?.role === "group")).toHaveLength(1);
    expect(elements.some((e) => e.ai?.role === "edge-label" && e.text === "HTTPS")).toBe(true);
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
    expect(elements.every((e) => e.ai?.generationId === "gen-1")).toBe(true);
  });

  it("uses a fresh id space per generation, so a second paste never collides", () => {
    const a = compile(SHOP, "gen-a").elements.map((e) => e.id);
    const b = compile(SHOP, "gen-b").elements.map((e) => e.id);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it("draws nothing and explains why when the code has errors", () => {
    const result = compile("Team {\n  A > B\n");
    expect(result.elements).toEqual([]);
    expect(result.issues.some((i) => i.severity === "error" && i.line === 1)).toBe(true);
  });

  it("asks for at least one node", () => {
    const result = compile("// nothing here\n");
    expect(result.elements).toEqual([]);
    expect(result.issues[0]).toMatchObject({ severity: "error" });
  });

  it("clamps an oversized diagram and says so, instead of failing", () => {
    const code = Array.from({ length: 60 }, (_, i) => `N${i} > N${i + 1}`).join("\n");
    const result = compile(code);
    expect(result.elements.filter((e) => e.type === "semantic-node")).toHaveLength(40);
    expect(result.issues.some((i) => i.severity === "warning" && /dropped/i.test(i.message))).toBe(true);
  });

  it("keeps warnings from the parser alongside the drawing", () => {
    const result = compile("A [wibble: 1] > B");
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.severity === "warning")).toBe(true);
  });
});

describe("graphFromElements", () => {
  it("reads a generated diagram back, including frames and connector labels", () => {
    const { elements } = compile(SHOP);
    const { graph, consumedIds } = graphFromElements(elements);
    expect(graph.nodes.map((n) => n.label).sort()).toEqual(["API", "Orders", "Orders DB", "Web App"]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.find((e) => e.label === "HTTPS")).toBeDefined();
    expect(graph.edges.find((e) => e.dashed)).toBeDefined();
    expect(graph.groups).toHaveLength(1);
    expect(graph.groups[0].nodeIds).toHaveLength(3);
    expect(graph.diagramType).toBe("architecture");
    // every generated element is accounted for, so "Update" can replace them all
    expect(consumedIds.sort()).toEqual(elements.map((e) => e.id).sort());
  });

  it("round-trips: code -> canvas -> code means the same thing", () => {
    const { elements } = compile(SHOP);
    const { graph } = graphFromElements(elements);
    expect(meaning(serializeDiagramCode(graph))).toEqual(meaning(SHOP));
  });

  const shape = (over: Partial<DrawingElement> & { id: string; type: string }) =>
    ({ points: [{ x: 0, y: 0 }, { x: 100, y: 60 }], color: "#000", strokeWidth: 2, ...over }) as DrawingElement;

  it("understands shapes the user drew by hand", () => {
    const elements: DrawingElement[] = [
      shape({ id: "r1", type: "rectangle", label: "Client" }),
      shape({ id: "d1", type: "diamond", label: "Valid?", points: [{ x: 300, y: 0 }, { x: 400, y: 80 }] }),
      shape({ id: "c1", type: "circle", points: [{ x: 600, y: 0 }, { x: 680, y: 80 }] }),
      shape({ id: "t1", type: "text", text: "a note", points: [{ x: 0, y: 200 }] }),
      shape({ id: "a1", type: "arrow", startConnection: { elementId: "r1" }, endConnection: { elementId: "d1" }, arrowHeadEnd: true } as never),
      shape({ id: "a2", type: "arrow", startConnection: { elementId: "d1" }, arrowHeadEnd: true } as never), // dangling
    ];
    const { graph, consumedIds } = graphFromElements(elements);
    expect(graph.nodes.map((n) => n.label)).toEqual(["Client", "Valid?", "Shape 1"]);
    expect(graph.nodes.find((n) => n.label === "Valid?")!.kind).toBe("decision");
    expect(graph.edges).toHaveLength(1);
    expect(consumedIds.sort()).toEqual(["a1", "c1", "d1", "r1"]); // note and dangling arrow stay put
  });

  it("only reads what it is given (a selection)", () => {
    const { elements } = compile("A > B\nC > D");
    const firstTwo = elements.filter((e) => ["A", "B"].includes(e.label ?? "") || (e.type === "arrow" && e.ai?.semanticId?.endsWith("edge-1")));
    const { graph } = graphFromElements(firstTwo);
    expect(graph.nodes.map((n) => n.label).sort()).toEqual(["A", "B"]);
  });

  it("reverses a connector that only has an arrowhead at its start", () => {
    const elements = [
      shape({ id: "r1", type: "rectangle", label: "A" }),
      shape({ id: "r2", type: "rectangle", label: "B" }),
      shape({ id: "a1", type: "arrow", startConnection: { elementId: "r1" }, endConnection: { elementId: "r2" }, arrowHeadStart: true, arrowHeadEnd: false } as never),
    ];
    const { graph } = graphFromElements(elements);
    expect(graph.edges[0]).toMatchObject({ from: "r2", to: "r1" });
  });

  it("returns an empty graph for an empty or irrelevant canvas", () => {
    expect(graphFromElements([]).graph.nodes).toEqual([]);
    const text = graphFromElements([shape({ id: "t", type: "text", text: "hi", points: [{ x: 0, y: 0 }] })]);
    expect(text.graph.nodes).toEqual([]);
    expect(text.consumedIds).toEqual([]);
  });
});

describe("node colours survive the canvas", () => {
  const roundTrip = (code: string) => {
    const { elements } = compile(code);
    return graphFromElements(elements).graph.nodes;
  };

  it("reads an explicit color back, so regenerating the code keeps it", () => {
    const nodes = roundTrip("type flowchart\nReview [color: #ff0066]\nShip [color: green]\nReview > Ship");
    expect(nodes.find((n) => n.label === "Review")?.color).toBe("#ff0066");
    expect(nodes.find((n) => n.label === "Ship")?.color).toBe("#16a34a");
    expect(serializeDiagramCode({ nodes, edges: [], groups: [] })).toContain("color: #ff0066");
  });

  it("does not invent a color for nodes that only have their kind's colours", () => {
    const nodes = roundTrip("type architecture\nAPI [kind: api]\nDB [kind: database]\nAPI > DB");
    expect(nodes.every((n) => n.color === undefined)).toBe(true);
  });

  it("keeps a custom colour on a diamond and a pill", () => {
    const nodes = roundTrip("type flowchart\nOK? [shape: diamond, color: #7c3aed]\nStart [shape: pill, color: #0d9488]\nStart > OK?");
    expect(nodes.find((n) => n.label === "OK?")?.color).toBe("#7c3aed");
    expect(nodes.find((n) => n.label === "Start")?.color).toBe("#0d9488");
  });
});

describe("icon-only nodes (shape: icon)", () => {
  const ICONS = `
type architecture

Web App [icon: browser, shape: icon]
API [icon: server, shape: icon]
Orders DB [kind: database, icon: database, shape: icon]

Web App > API: HTTPS
API > Orders DB
`;

  it("parses shape: icon", () => {
    const parsed = parseDiagramCode(ICONS);
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(parsed.nodes.map((n) => [n.label, n.shape, n.icon])).toEqual([
      ["Web App", "icon", "browser"],
      ["API", "icon", "server"],
      ["Orders DB", "icon", "database"],
    ]);
  });

  it("draws each as a bare icon element with a caption and no node box, and connects them", () => {
    const { elements, issues } = compile(ICONS);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    const icons = elements.filter((e) => e.type === "icon");
    expect(icons.map((e) => e.label)).toEqual(expect.arrayContaining(["Web App", "API", "Orders DB"]));
    expect(elements.filter((e) => e.type === "semantic-node")).toHaveLength(0);
    for (const icon of icons) {
      expect(icon.fill).toBeUndefined();
      expect(icon.ai).toMatchObject({ role: "node" });
      expect(icon.ai?.icon ?? icon.ai?.semanticKind).toBeTruthy();
      const [a, b] = icon.points;
      expect(b.y - a.y).toBeGreaterThanOrEqual(64 + 36);
    }
    const arrows = elements.filter((e) => e.type === "arrow");
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows as unknown as Array<{ startConnection?: unknown; endConnection?: unknown }>) {
      expect(arrow.startConnection).toBeTruthy();
      expect(arrow.endConnection).toBeTruthy();
    }
  });

  it("round-trips back to the same code meaning", () => {
    const { elements } = compile(ICONS);
    const { graph } = graphFromElements(elements);
    // The glyph is the named icon, or the kind's own when the icon: equalled it.
    expect(graph.nodes.map((n) => [n.label, n.shape, n.icon ?? n.kind])).toEqual(
      expect.arrayContaining([
        ["Web App", "icon", "browser"],
        ["API", "icon", "server"],
        ["Orders DB", "icon", "database"],
      ]),
    );
    const again = serializeDiagramCode(graph);
    expect(again).toContain("shape: icon");
    expect(meaning(again).edges).toEqual(meaning(ICONS).edges);
  });

  it("falls back to a normal node when no icon is named", () => {
    const { elements } = compile("Lonely [shape: icon]\nOther\nLonely > Other");
    expect(elements.filter((e) => e.type === "icon")).toHaveLength(0);
    expect(elements.filter((e) => e.type === "semantic-node").length).toBeGreaterThanOrEqual(2);
  });

  it("does not treat an icon the user inserted by hand as a diagram node", () => {
    const manual = { id: "i1", type: "icon", points: [{ x: 0, y: 0 }, { x: 64, y: 64 }], color: "#475569", strokeWidth: 2, ai: { icon: "database" } } as DrawingElement;
    expect(graphFromElements([manual]).graph.nodes).toHaveLength(0);
  });
});

describe("architecture diagrams written as code follow their flow", () => {
  const FLOW = `type architecture
Start [kind: start]
Customer [icon: user, shape: icon]
Web Shop [icon: browser, shape: icon]
Validate Order [kind: workflow]
In Stock? [kind: decision]
Reserve Stock [kind: workflow]
Backorder [kind: alerting]
Payment [icon: stripe, shape: icon]
Notify Customer [kind: workflow]
Done [kind: end]
Start > Customer > Web Shop > Validate Order > In Stock?
In Stock? > Reserve Stock: yes
In Stock? > Backorder: no
Reserve Stock > Payment > Notify Customer > Done`;

  it("does not pile connected nodes into one wide row just because they share a tier", () => {
    const { elements } = compile(FLOW);
    const rows = new Map<number, number>();
    for (const e of elements.filter((el) => el.ai?.role === "node")) {
      const y = Math.round(e.points[0].y / 20);
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    expect(Math.max(...rows.values())).toBeLessThanOrEqual(3);
    expect(rows.size).toBeGreaterThanOrEqual(7);
  });
});

describe("code with layout: exact position, size and sides", () => {
  const boxOf = (elements: DrawingElement[], label: string) => {
    const el = elements.find((e) => e.ai?.role === "node" && e.label === label)!;
    return { x: Math.min(el.points[0].x, el.points[1].x), y: Math.min(el.points[0].y, el.points[1].y), w: Math.abs(el.points[1].x - el.points[0].x), h: Math.abs(el.points[1].y - el.points[0].y) };
  };

  it("draws a node exactly where and how big the code says", () => {
    const { elements } = compile("A [x: 300, y: 120, w: 220, h: 90]\nB\nA > B");
    expect(boxOf(elements, "A")).toEqual({ x: 300, y: 120, w: 220, h: 90 });
    // The node without coordinates is laid out around it, not on top of it.
    const b = boxOf(elements, "B");
    expect(b.x < 520 && b.x + b.w > 300 && b.y < 210 && b.y + b.h > 120).toBe(false);
  });

  it("uses the sides the code names, and picks the other automatically", () => {
    const { elements } = compile("A [x: 0, y: 0]\nB [x: 400, y: 0]\nA > B: [from: bottom, to: left]");
    const arrow = elements.find((e) => e.type === "arrow") as { startConnection?: { anchorId: string }; endConnection?: { anchorId: string } };
    expect(arrow.startConnection?.anchorId).toMatch(/bottom/);
    expect(arrow.endConnection?.anchorId).toMatch(/left/);
    const half = compile("A [x: 0, y: 0]\nB [x: 400, y: 0]\nA > B: [from: top]").elements.find((e) => e.type === "arrow") as { startConnection?: { anchorId: string } };
    expect(half.startConnection?.anchorId).toMatch(/top/);
  });

  it("round-trips a diagram through the code with layout: same positions, sizes and sides", () => {
    const original = compile(SHOP).elements;
    const { graph } = graphFromElements(original, { layout: true });
    const code = serializeDiagramCode(graph);
    expect(code).toMatch(/x: -?\d+, y: -?\d+, w: \d+, h: \d+/);
    expect(code).toMatch(/\[from: (top|right|bottom|left), to: (top|right|bottom|left)\]/);
    const again = compile(code).elements;
    for (const label of graph.nodes.map((n) => n.label)) expect(boxOf(again, label)).toEqual(boxOf(original, label));
    const sides = (els: DrawingElement[]) =>
      els.filter((e) => e.type === "arrow").map((e) => {
        const a = e as unknown as { startConnection: { anchorId: string }; endConnection: { anchorId: string } };
        return `${a.startConnection.anchorId.split(":").pop()}>${a.endConnection.anchorId.split(":").pop()}`;
      });
    expect(sides(again).sort()).toEqual(sides(original).sort());
  });

  it("keeps an edge colour the user chose, but not the default line colour", () => {
    const { elements } = compile("A > B: [color: red]\nB > C");
    const { graph } = graphFromElements(elements);
    expect(graph.edges.find((e) => e.color)).toMatchObject({ color: "#dc2626" });
    expect(graph.edges.filter((e) => e.color)).toHaveLength(1);
  });

  it("writes no layout unless asked", () => {
    const { graph } = graphFromElements(compile(SHOP).elements);
    expect(serializeDiagramCode(graph)).not.toMatch(/\bx: \d|\[from:/);
  });
});

describe("how the agent's drawing looks", () => {
  it("draws a group with a bold border and a big bold heading, in black (white in the dark theme)", () => {
    const { elements } = compile(SHOP);
    const frame = elements.find((e) => e.ai?.role === "group")!;
    const heading = elements.find((e) => e.ai?.role === "group-label")!;
    expect(frame).toMatchObject({ color: "#000000", strokeWidth: 3 });
    expect(heading).toMatchObject({ color: "#000000", fontSize: 24, fontWeight: "800", text: "Backend" });
  });

  it("makes room for the heading: nothing inside the frame sits under it", () => {
    const { elements } = compile(SHOP);
    const frame = elements.find((e) => e.ai?.role === "group")!;
    const heading = elements.find((e) => e.ai?.role === "group-label")!;
    const headingBottom = heading.points[0].y + 24 * 1.2;
    const nodeTops = elements.filter((e) => e.ai?.role === "node" && e.points[0].x >= frame.points[0].x && e.points[1].x <= frame.points[1].x && e.points[0].y >= frame.points[0].y && e.points[1].y <= frame.points[1].y).map((e) => Math.min(e.points[0].y, e.points[1].y));
    expect(nodeTops.length).toBeGreaterThan(0);
    for (const top of nodeTops) expect(top).toBeGreaterThanOrEqual(headingBottom);
  });

  it("draws connectors and their labels black by default, but keeps a colour the code chose", () => {
    const { elements } = compile("A > B: hi\nB > C: [color: red]");
    const arrows = elements.filter((e) => e.type === "arrow");
    expect(arrows.map((a) => a.color).sort()).toEqual(["#000000", "#dc2626"]);
    expect(elements.find((e) => e.ai?.role === "edge-label")?.color).toBe("#000000");
  });

  it("writes the code in reading order when it carries positions", () => {
    const { elements } = compile("Zeta > Alpha > Mid");
    const code = serializeDiagramCode(graphFromElements(elements, { layout: true }).graph);
    expect(code.indexOf("Zeta [")).toBeLessThan(code.indexOf("Alpha ["));
    expect(code.indexOf("Alpha [")).toBeLessThan(code.indexOf("Mid ["));
  });
});

describe("group headings and connectors", () => {
  it("no connector runs through a group's heading", async () => {
    const { segmentHitsBox } = await import("@/features/ai/server/layout/geometry");
    const { estimateTextWidth } = await import("@/core/text/estimate");
    const { elements } = compile(`type architecture
Backend {
  API Gateway [icon: api, shape: icon]
  Orders [kind: service]
  Orders DB [kind: database, shape: icon]
}
Customer [icon: user, shape: icon]
Web App [icon: browser, shape: icon]
Customer > Web App: HTTPS
Web App > API Gateway
API Gateway > Orders
Orders > Orders DB: SQL`);
    const heading = elements.find((e) => e.ai?.role === "group-label")!;
    const box = {
      minX: heading.points[0].x,
      minY: heading.points[0].y,
      maxX: heading.points[0].x + estimateTextWidth(heading.text ?? "", 24, "800"),
      maxY: heading.points[0].y + 24 * 1.2,
    };
    for (const arrow of elements.filter((e) => e.type === "arrow")) {
      const hit = arrow.points.slice(0, -1).some((p, i) => segmentHitsBox(p, arrow.points[i + 1], box));
      expect(hit, `an arrow runs through the "${heading.text}" heading`).toBe(false);
    }
  });
});

describe("frames in code before the canvas can draw them", () => {
  it("still draws the nodes and says plainly that the frame is not drawn", () => {
    const result = elementsFromDiagramCode("frame Edge {\n  API\n  Web\n}\nWeb > API", { generationId: "g", frameId: "f" });
    expect(result.elements.filter((e) => e.ai?.role === "node")).toHaveLength(2);
    expect(result.issues).toEqual([expect.objectContaining({ severity: "warning", code: "frame/not-drawn" })]);
  });
});
