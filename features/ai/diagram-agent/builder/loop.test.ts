import { describe, expect, it } from "vitest";
import type { ToolTransport } from "../types";
import { runDiagramBuilder, type CanvasUpdate } from "./loop";
import { call, scripted, turn } from "./testing";

const run = (transport: ToolTransport, extra: Partial<Parameters<typeof runDiagramBuilder>[0]> = {}) =>
  runDiagramBuilder({ transport, system: "sys", goal: "draw a login flow", generationId: "g", frameId: "f", retry: { maxAttempts: 1, baseDelayMs: 0 }, ...extra });

const LOGIN = [
  "type flowchart",
  "Start [kind: start]",
  "Enter Credentials [kind: workflow]",
  "Valid? [kind: decision]",
  "MFA Required? [kind: decision]",
  "Create Session [kind: workflow]",
  "Show Error [kind: alerting]",
];
const LOGIN_EDGES = [
  "Start > Enter Credentials > Valid?",
  "Valid? > MFA Required?: yes",
  "Valid? > Show Error: no",
  "Show Error > Enter Credentials: retry",
  "MFA Required? > Create Session: no",
];

describe("runDiagramBuilder", () => {
  it("draws each step before the next one and shows the model the canvas it made", async () => {
    const updates: CanvasUpdate[] = [];
    const m = scripted([
      turn(call("add", "type flowchart\nStart [kind: start]\nStart > Enter Credentials")),
      turn(call("add", "Enter Credentials > Valid?")),
      turn(call("finish")),
    ]);
    const result = await run(m.transport, { onCanvas: (u) => void updates.push(u) });

    expect(result.finished).toBe(true);
    expect(updates).toHaveLength(2);
    expect(updates[0].added.length).toBeGreaterThan(0);
    expect(updates[0].elements.filter((e) => e.ai?.role === "node")).toHaveLength(2);
    expect(updates[1].elements.filter((e) => e.ai?.role === "node")).toHaveLength(3);
    // The second turn is shown what the first one drew, and the first turn an empty canvas.
    expect(m.shown[0]).toContain("The canvas is empty");
    expect(m.shown[1]).toContain("Enter Credentials");
    expect(m.shown[1]).toContain("Start > Enter Credentials");
    expect(m.shown[2]).toContain("Valid?");
  });

  it("streams updates to elements that already exist, not only new ones", async () => {
    const updates: CanvasUpdate[] = [];
    const m = scripted([turn(call("add", "A > B\nB > C")), turn(call("adjust", "move B: right 100")), turn(call("finish"))]);
    await run(m.transport, { guardAdjustments: false, onCanvas: (u) => void updates.push(u) });
    expect(updates[1].updated.length).toBeGreaterThan(0);
    expect(updates[1].added).toEqual([]);
  });

  it("takes back an adjustment that made the picture worse, and tells the model why", async () => {
    const updates: CanvasUpdate[] = [];
    const m = scripted([turn(call("add", "A > B > C")), turn(call("adjust", "move B: right 200\nmove C: left 200")), turn(call("finish"))]);
    const result = await run(m.transport, { onCanvas: (u) => void updates.push(u) });
    expect(m.shown[2]).toMatch(/Undid that adjustment: it made the picture worse/);
    expect(result.state.offsets.size).toBe(0);
    // The client is told to put the elements back as well.
    expect(updates).toHaveLength(3);
  });

  it("keeps the adjustment when the guard is off, and shows the model what it moved", async () => {
    const m = scripted([turn(call("add", "A > B > C")), turn(call("adjust", "move B: right 200")), turn(call("finish")), turn(call("finish"))]);
    const result = await run(m.transport, { guardAdjustments: false });
    expect(result.state.offsets.size).toBe(1);
    expect(m.shown[2]).toContain("Moved by hand: B (+200, +0)");
    expect(m.shown[2]).not.toMatch(/Undid/);
  });

  it("keeps an adjustment that fixes problems even if connectors get longer", async () => {
    const code = ["type flowchart", "Start [kind: start]", "Enter Credentials [kind: workflow]", "Valid? [kind: decision]", "MFA Required? [kind: decision]", "Create Session [kind: workflow]", "Show Error [kind: alerting]"];
    const edges = ["Start > Enter Credentials > Valid?", "Valid? > MFA Required?: yes", "Valid? > Show Error: no", "Show Error > Enter Credentials: retry", "MFA Required? > Create Session: no"];
    const m = scripted([turn(call("add", code.join("\n"))), turn(call("add", edges.join("\n"))), turn(call("adjust", "sides Show Error > Enter Credentials: right, right")), turn(call("finish"))]);
    const result = await run(m.transport);
    expect(m.shown[3]).not.toMatch(/Undid/);
    expect(result.state.edgeSides.size).toBe(1);
  });

  it("tells the model when an add failed and leaves the canvas as it was", async () => {
    const m = scripted([turn(call("add", "A > B")), turn(call("add", "G {\n  X")), turn(call("finish"))]);
    const result = await run(m.transport);
    expect(m.shown[2]).toMatch(/add failed, nothing was added/);
    expect(result.state.parsed.nodes.map((n) => n.name)).toEqual(["A", "B"]);
  });

  it("does not accept finish while problems remain, and accepts once the agent fixes them", async () => {
    const m = scripted([
      turn(call("add", LOGIN.join("\n"))),
      turn(call("add", LOGIN_EDGES.join("\n"))),
      turn(call("finish")),
      turn(call("adjust", "sides Show Error > Enter Credentials: right, right\nsides Valid? > Show Error: right, top")),
      turn(call("finish")),
    ]);
    const result = await run(m.transport);
    // The first finish is refused with the problems named; the agent then fixes them and finishes.
    expect(m.shown[3]).toContain("You asked to finish but problems remain");
    expect(m.shown[3]).toMatch(/Show Error > Enter Credentials/);
    expect(result.reviews).toBeGreaterThanOrEqual(1);
    expect(result.finished).toBe(true);
    expect(result.state.edgeSides.size).toBe(2);
  });

  it("accepts a finish that is repeated with nothing changed, and stops reviewing when the budget is spent", async () => {
    const setup = [turn(call("add", LOGIN.join("\n"))), turn(call("add", LOGIN_EDGES.join("\n")))];
    const again = scripted([...setup, turn(call("finish")), turn(call("finish"))]);
    const r1 = await run(again.transport);
    expect(r1.finished).toBe(true);
    expect(again.turns()).toBe(4);

    const noReviews = scripted([...setup, turn(call("finish"))]);
    const r2 = await run(noReviews.transport, { maxReviews: 0 });
    expect(r2.finished).toBe(true);
    expect(noReviews.turns()).toBe(3);
  });

  it("treats a diagram in a fence as an add", async () => {
    const m = scripted([{ text: "", toolCalls: [], code: "A > B" }, turn(call("finish"))]);
    const result = await run(m.transport);
    expect(result.state.parsed.nodes.map((n) => n.name)).toEqual(["A", "B"]);
  });

  it("gives up cleanly: keeps the canvas after repeated empty replies, and throws when there is none", async () => {
    const some = scripted([turn(call("add", "A > B")), turn(), turn()]);
    const kept = await run(some.transport);
    expect(kept.finished).toBe(false);
    expect(kept.state.parsed.nodes).toHaveLength(2);

    const none = scripted([turn(), turn(), turn()]);
    await expect(run(none.transport, { maxTurns: 3 })).rejects.toThrow();
  });

  it("does not spend the turn budget on icon lookups", async () => {
    const m = scripted([turn(call("search_icons", "kafka")), turn(call("search_icons", "postgres")), turn(call("add", "A > B")), turn(call("finish"))]);
    const result = await run(m.transport, { maxTurns: 2 });
    expect(result.finished).toBe(true);
    expect(m.shown[1]).toMatch(/kafka|Icons for/);
  });

  it("shows view details and, with a renderer, a picture on review steps", async () => {
    const rendered: number[] = [];
    const m = scripted([
      turn(call("add", LOGIN.join("\n"))),
      turn(call("add", LOGIN_EDGES.join("\n")), call("view")),
      turn(call("finish")),
      turn(call("finish")),
    ]);
    await run(m.transport, { renderImage: async (els) => (rendered.push(els.length), "data:image/png;base64,AAAA") });
    expect(m.shown[2]).toContain("Connections (side it leaves -> side it enters)");
    expect(m.images[2]).toEqual(["data:image/png;base64,AAAA"]);
    expect(m.images[0]).toBeUndefined();
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    const m = scripted([turn(call("add", "A > B"))]);
    controller.abort();
    await expect(run(m.transport, { signal: controller.signal })).rejects.toThrow(/cancelled/);
  });
});

describe("when the provider runs out of quota", () => {
  const limited = (after: number): ToolTransport => {
    const m = scripted([turn(call("add", "A > B")), turn(call("add", "B > C")), turn(call("finish"))]);
    let calls = 0;
    return {
      kind: "native",
      async complete(messages, options) {
        calls += 1;
        if (calls > after) throw new Error('429 {"error":{"message":"Rate limit reached for tokens per day (TPD)"}}');
        return m.transport.complete(messages, options);
      },
    };
  };

  it("keeps what is already on the canvas instead of failing the whole run", async () => {
    const result = await run(limited(1));
    expect(result.stoppedByQuota).toBe(true);
    expect(result.finished).toBe(false);
    expect(result.state.parsed.nodes.map((n) => n.name)).toEqual(["A", "B"]);
  });

  it("still fails when there is nothing to keep", async () => {
    await expect(run(limited(0))).rejects.toThrow(/429|rate limit/i);
  });
});

describe("when the model is slow", () => {
  it("stops starting steps after the time limit and keeps the canvas", async () => {
    const m = scripted([turn(call("add", "A > B")), turn(call("add", "B > C")), turn(call("add", "C > D")), turn(call("finish"))]);
    const slow: ToolTransport = {
      kind: "native",
      async complete(messages, options) {
        await new Promise((r) => setTimeout(r, 30));
        return m.transport.complete(messages, options);
      },
    };
    const result = await run(slow, { maxMs: 50 });
    expect(result.timedOut).toBe(true);
    expect(result.finished).toBe(false);
    expect(result.state.parsed.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.state.parsed.nodes.length).toBeLessThan(4);
  });

  it("never times out before anything is drawn", async () => {
    const m = scripted([turn(call("add", "A > B")), turn(call("finish"))]);
    const result = await run(m.transport, { maxMs: -1 });
    expect(result.built.elements.length).toBeGreaterThan(0);
  });
});

describe("icon lookups and time", () => {
  it("does not give free turns for asking the same icons again", async () => {
    // Repeated lookups of the same terms: only the first is free, so a budget of 2 steps runs out.
    const m = scripted([turn(call("search_icons", "kafka")), turn(call("search_icons", "Kafka")), turn(call("search_icons", "kafka")), turn(call("add", "A > B"))]);
    await expect(run(m.transport, { maxTurns: 2 })).rejects.toThrow();
    expect(m.turns()).toBe(3);
  });

  it("tells the model how much working time is left", async () => {
    const m = scripted([turn(call("add", "A > B")), turn(call("finish"))]);
    await run(m.transport, { maxMs: 90_000 });
    expect(m.shown[0]).toMatch(/About \d+ seconds of working time are left/);
  });
});

describe("icons only requests", () => {
  it("turns every added node with an icon into a bare icon, however the model wrote it", async () => {
    const m = scripted([turn(call("add", "Web [icon: browser]\nAPI [icon: gateway]\nWeb > API")), turn(call("finish"))]);
    const result = await run(m.transport, { bareIcons: true });
    expect(result.state.parsed.nodes.map((n) => n.shape)).toEqual(["icon", "icon"]);
    expect(result.built.elements.filter((e) => e.ai?.role === "node").every((e) => e.type === "icon")).toBe(true);
  });
});

describe("icons first", () => {
  const code = "API Gateway [kind: gateway]\nOrders DB [kind: database]\nValidate the order against the full pricing and stock rules [kind: process]\nCheck? [kind: decision]\nPlain\nAPI Gateway > Orders DB\nOrders DB > Validate the order against the full pricing and stock rules\nValidate the order against the full pricing and stock rules > Check?\nCheck? > Plain";

  it("draws recognisable things with short names as icons, and keeps boxes for long text, steps, decisions and plain nodes", async () => {
    const m = scripted([turn(call("add", code)), turn(call("finish"))]);
    const result = await run(m.transport, { iconPriority: true });
    const shapes = Object.fromEntries(result.state.parsed.nodes.map((n) => [n.label, result.built.elements.find((e) => e.ai?.semanticId === n.id)?.type]));
    expect(shapes["API Gateway"]).toBe("icon");
    expect(shapes["Orders DB"]).toBe("icon");
    expect(shapes["Validate the order against the full pricing and stock rules"]).toBe("semantic-node");
    expect(shapes["Check?"]).toBe("diamond");
    expect(shapes["Plain"]).toBe("semantic-node");
  });

  it("changes nothing when icon priority is off (plain boxes asked for, or editing)", async () => {
    const m = scripted([turn(call("add", "Web [kind: browser]\nAPI [kind: gateway]\nWeb > API")), turn(call("finish"))]);
    const result = await run(m.transport, {});
    expect(result.state.parsed.nodes.every((n) => !n.shape)).toBe(true);
  });

  it("leaves a shape the model chose alone", async () => {
    const m = scripted([turn(call("add", "Web [kind: browser, shape: pill]\nAPI [kind: gateway]\nWeb > API")), turn(call("finish"))]);
    const result = await run(m.transport, { iconPriority: true });
    expect(result.state.parsed.nodes.map((n) => n.shape)).toEqual(["pill", "icon"]);
  });
});
