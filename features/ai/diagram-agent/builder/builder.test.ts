import { describe, expect, it } from "vitest";
import { buildCanvas, diffElements } from "./canvas";
import { reportCanvas } from "./report";
import { addLines, adjust, createState, describeMoved, MAX_ADD_STATEMENTS, MAX_OFFSET } from "./state";

const build = (code: string) => addLines(createState(), code).state;
const canvasOf = (state: ReturnType<typeof createState>) => buildCanvas(state, "g", "f")!;
const centre = (state: ReturnType<typeof createState>, name: string) => {
  const node = state.parsed.nodes.find((n) => n.name === name)!;
  return canvasOf(state).centres.get(node.id)!;
};

describe("addLines", () => {
  it("builds the diagram up across calls and reports what each call created", () => {
    const first = addLines(createState(), "type flowchart\nStart [kind: start]\nStart > Enter Credentials");
    expect(first.errors).toEqual([]);
    expect(first.added).toEqual(expect.arrayContaining(["Start", "Enter Credentials", "Start > Enter Credentials"]));
    const second = addLines(first.state, "Enter Credentials > Valid? ");
    expect(second.state.parsed.nodes.map((n) => n.name)).toEqual(["Start", "Enter Credentials", "Valid?"]);
    expect(second.state.parsed.diagramType).toBe("flowchart");
    expect(second.added).toEqual(["Valid?", "Enter Credentials > Valid?"]);
  });

  it("does not duplicate a connection that is added twice", () => {
    const s = build("A > B");
    expect(addLines(s, "A > B").state.parsed.edges).toHaveLength(1);
    expect(addLines(s, "A > B").added).toEqual([]);
  });

  it("keeps only a few statements per call and says how many it left out", () => {
    const lines = Array.from({ length: MAX_ADD_STATEMENTS + 3 }, (_, i) => `N${i}`).join("\n");
    const result = addLines(createState(), lines);
    expect(result.state.parsed.nodes).toHaveLength(MAX_ADD_STATEMENTS);
    expect(result.skipped).toBe(3);
  });

  it("never cuts a group block in half", () => {
    const result = addLines(createState(), "G {\n  A\n  B\n  C\n}\nD");
    expect(result.errors).toEqual([]);
    expect(result.state.parsed.groups).toHaveLength(1);
    expect(result.state.parsed.groups[0].nodeIds).toHaveLength(3);
  });

  it("rejects bad code without changing the state", () => {
    const s = build("A > B");
    const bad = addLines(s, "C [color: ]\nC > {");
    if (bad.errors.length > 0) expect(bad.state).toBe(s);
    const unclosed = addLines(s, "G {\n  X");
    expect(unclosed.errors.length).toBeGreaterThan(0);
    expect(unclosed.state).toBe(s);
  });

  it("keeps icon-only nodes", () => {
    const s = build("Hub [icon: router, shape: icon]");
    expect(s.parsed.nodes[0]).toMatchObject({ shape: "icon", icon: "router" });
    expect(s.code).toContain("shape: icon");
  });
});

describe("adjust", () => {
  const chain = () => build("A > B > C");

  it("accepts several commands on one line separated by semicolons, and keeps a semicolon inside a label", () => {
    const s = chain();
    const r = adjust(s, "move B: right 100; align C with A: x; label A > B: a; b", canvasOf(s).centres);
    expect(r.errors).toEqual([]);
    expect(r.applied).toHaveLength(3);
    expect(r.state.parsed.edges.find((e) => e.label)?.label).toBe("a; b");
  });

  it("moves a node relative to where the layout puts it, and keeps that as the diagram grows", () => {
    const s = chain();
    const before = centre(s, "B");
    const moved = adjust(s, "move B: right 100", canvasOf(s).centres).state;
    expect(centre(moved, "B").x - before.x).toBeCloseTo(100, 0);
    const grown = addLines(moved, "C > D").state;
    const withD = centre(grown, "B");
    const without = centre(addLines(s, "C > D").state, "B");
    expect(withD.x - without.x).toBeCloseTo(100, 0);
  });

  it("aligns a node with another on one axis", () => {
    const s = build("A > B\nA > C");
    const after = adjust(s, "align B with C: y", canvasOf(s).centres).state;
    expect(centre(after, "B").y).toBeCloseTo(centre(after, "C").y, 0);
  });

  it("changes the sides a connection uses", () => {
    const s = chain();
    const before = canvasOf(s).elements.find((e) => e.type === "arrow") as { startConnection?: { anchorId: string } };
    const after = adjust(s, "sides A > B: right, left", canvasOf(s).centres).state;
    const arrow = canvasOf(after).elements.find((e) => e.type === "arrow") as { startConnection?: { anchorId: string }; endConnection?: { anchorId: string } };
    expect(arrow.startConnection?.anchorId).toMatch(/right/);
    expect(arrow.endConnection?.anchorId).toMatch(/left/);
    expect(before.startConnection?.anchorId).not.toMatch(/right/);
  });

  it("removes a node with its connections and relabels a connection", () => {
    const s = chain();
    const removed = adjust(s, "remove B", canvasOf(s).centres).state;
    expect(removed.parsed.nodes.map((n) => n.name)).toEqual(["A", "C"]);
    expect(removed.parsed.edges).toHaveLength(0);
    const labelled = adjust(s, "label A > B: HTTPS", canvasOf(s).centres).state;
    expect(labelled.parsed.edges.find((e) => e.label === "HTTPS")).toBeDefined();
  });

  it("reports a bad command and still applies the others", () => {
    const s = chain();
    const result = adjust(s, "move Nope: left\nmove B: down\nfly B", canvasOf(s).centres);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/no node named "Nope"/);
    expect(result.applied).toEqual(["moved B by 0, 60"]);
  });

  it("keeps a node within a limit of its automatic place, however many times it is moved", () => {
    let s = chain();
    for (let i = 0; i < 6; i += 1) s = adjust(s, "move B: right 200", canvasOf(s).centres).state;
    expect(s.offsets.get(s.parsed.nodes.find((n) => n.name === "B")!.id)?.dx).toBe(MAX_OFFSET);
    const again = adjust(s, "move B: right 50", canvasOf(s).centres);
    expect(again.applied[0]).toMatch(/limit reached/);
  });

  it("lists what was moved by hand, and nothing once it is reset", () => {
    const s = chain();
    const moved = adjust(s, "move B: right 100", canvasOf(s).centres).state;
    expect(describeMoved(moved)).toEqual(["B (+100, +0)"]);
    expect(describeMoved(adjust(moved, "reset B", canvasOf(moved).centres).state)).toEqual([]);
  });

  it("suggests a close name", () => {
    const s = build("Home Hub > Broker");
    expect(adjust(s, "move Hub: up", canvasOf(s).centres).errors[0]).toMatch(/Home Hub/);
  });
});

describe("buildCanvas and diffElements", () => {
  it("anchors the drawing at the top-left so growth cannot push it out of view", () => {
    const small = canvasOf(build("A > B"));
    const grown = canvasOf(addLines(build("A > B"), "A > C\nA > D\nA > E").state);
    for (const c of [small, grown]) {
      const xs = c.elements.flatMap((e) => e.points.map((p) => p.x));
      const ys = c.elements.flatMap((e) => e.points.map((p) => p.y));
      expect(Math.min(...xs)).toBeCloseTo(0, 5);
      expect(Math.min(...ys)).toBeCloseTo(0, 5);
    }
  });

  it("diffs into added, updated and removed", () => {
    const one = canvasOf(build("A > B")).elements;
    const first = diffElements(new Map(), one);
    expect(first.added).toHaveLength(one.length);
    const two = canvasOf(addLines(build("A > B"), "B > C").state).elements;
    const next = diffElements(first.signatures, two);
    expect(next.added.length).toBeGreaterThan(0);
    expect(next.removedIds).toEqual([]);
    const gone = diffElements(next.signatures, one);
    expect(gone.removedIds.length).toBeGreaterThan(0);
  });
});

describe("reportCanvas", () => {
  it("finds nothing wrong with a plain chain", () => {
    const s = build("type flowchart\nStart > Validate > Ship");
    expect(reportCanvas(canvasOf(s), s).problems).toEqual([]);
  });

  it("names the connections that share a line (the login flow's retry arrow)", () => {
    const code = `type flowchart
Start [kind: start]
Enter Credentials [kind: workflow]
Valid? [kind: decision]
MFA Required? [kind: decision]
Create Session [kind: workflow]
Show Error [kind: alerting]
Dashboard [kind: end]
Start > Enter Credentials > Valid?
Valid? > MFA Required?: yes
Valid? > Show Error: no
Show Error > Enter Credentials: retry
MFA Required? > Create Session: no
Create Session > Dashboard`;
    // The agent adds a few statements at a time.
    let state = createState();
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i += MAX_ADD_STATEMENTS) state = addLines(state, lines.slice(i, i + MAX_ADD_STATEMENTS).join("\n")).state;
    const problems = reportCanvas(canvasOf(state), state).problems.join("\n");
    expect(problems).toMatch(/Show Error > Enter Credentials/);
    expect(problems).toMatch(/same line/);
  });

  it("flags a very long connector and counts problems for comparing versions", () => {
    const s = build("A > B");
    const spread = adjust(s, "move B: 200, 200", canvasOf(s).centres).state;
    const far = adjust(spread, "move B: 200, 200", canvasOf(spread).centres).state;
    const a = reportCanvas(canvasOf(s), s);
    const b = reportCanvas(canvasOf(far), far);
    expect(b.score.connectorLength).toBeGreaterThan(a.score.connectorLength);
    expect(a.score.problems).toBe(a.problems.length);
  });

  it("describes where nodes are and which sides connections use", () => {
    const s = build("A > B");
    const { detail } = reportCanvas(canvasOf(s), s);
    expect(detail).toContain("A (");
    expect(detail).toMatch(/A > B: bottom -> top/);
  });
});

describe("a group member with no connection yet", () => {
  it("sits level with its group's connected members instead of stretching the frame to the top row", async () => {
    const { buildCanvas } = await import("./canvas");
    const state = addLines(createState(), `type architecture
A > B > C > D
Data {
  Cache
  Warehouse
}
D > Cache`).state;
    const built = buildCanvas(state, "g", "f")!;
    const top = (id: string) => built.elements.find((e) => e.ai?.semanticId === id)!.points[0].y;
    expect(top("warehouse")).toBe(top("cache"));
  });
});

describe("groups that share rows", () => {
  it("keeps every group frame when one group feeds another and they would start on the same row", () => {
    const nodes = `type architecture
Start [kind: start]
Mobile app [icon: mobile]
Web app [icon: monitor]
Edge {
  CDN [icon: cdn]
  API Gateway [icon: gateway]
}
Backend services {
  Auth service [icon: authentication]
  Catalog service [icon: service]
  Order service [icon: service]
}
Data {
  Redis cache [icon: redis]
  Postgres [icon: postgres]
  Kafka [icon: kafka]
  Data warehouse [icon: database]
}
Email worker [icon: worker]
Analytics worker [icon: worker]
Stripe payment [icon: external]`;
    const edges = [
      `Start > Mobile app
Start > Web app
Mobile app > CDN: HTTPS
Web app > CDN: HTTPS
CDN > API Gateway
API Gateway > Auth service: sign in
Auth service > Catalog service: token
Catalog service > Order service: checkout`,
      `Catalog service > Redis cache: read
Redis cache > Catalog service: hit
Catalog service > Postgres: fallback
Order service > Stripe payment: charge
Order service > Postgres: save order
Order service > Kafka: order placed
Kafka > Email worker
Kafka > Analytics worker
Analytics worker > Data warehouse`,
    ];
    let state = addLines(createState(), nodes).state;
    for (const chunk of edges) state = addLines(state, chunk).state;
    const built = buildCanvas(state, "g", "f")!;
    expect(built.diagnostics.droppedGroups).toEqual([]);
    expect(built.elements.filter((e) => e.ai?.role === "group")).toHaveLength(3);
  });
});

describe("icons only", () => {
  it("draws every node with an icon as a bare icon, but keeps decisions and start/end as their own shapes", async () => {
    const { withBareIcons } = await import("./state");
    const state = withBareIcons(addLines(createState(), `type flowchart
Start [kind: start]
Gateway [icon: gateway]
Database [kind: database]
Ok? [kind: decision]
Plain
Start > Gateway > Database > Ok?
Ok? > Plain`).state);
    const built = buildCanvas(state, "g", "f")!;
    const typeOf = (id: string) => built.elements.find((e) => e.ai?.semanticId === id)!.type;
    expect(typeOf("gateway")).toBe("icon");
    expect(typeOf("database")).toBe("icon");
    expect(typeOf("start")).toBe("pill");
    expect(typeOf("ok")).toBe("diamond");
    expect(typeOf("plain")).not.toBe("icon");
    expect(state.code).toContain("shape: icon");
  });
});
