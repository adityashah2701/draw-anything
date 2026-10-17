import { describe, expect, it } from "vitest";
import { buildCanvas, diffElements } from "./canvas";
import { reportCanvas } from "./report";
import { addLines, adjust, createState, MAX_ADD_STATEMENTS } from "./state";

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
    expect(result.applied).toEqual(["moved B by 0, 80"]);
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

  it("describes where nodes are and which sides connections use", () => {
    const s = build("A > B");
    const { detail } = reportCanvas(canvasOf(s), s);
    expect(detail).toContain("A (");
    expect(detail).toMatch(/A > B: bottom -> top/);
  });
});
