import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, node } from "../test-helpers";
import { call, enable, reply, scriptedRun, type ScriptContext } from "./test-support";

/**
 * Design-first drawing with a scripted model: plan the geometry, draw exactly that, review the measured result,
 * correct narrowly and stop. Only the model's replies are written out; the prompt, tools and board are real.
 */

type Plan = { slots: Array<{ x: number; y: number; width: number; height: number }>; lanes: number };
const dataOf = <T>(context: ScriptContext, tool: string): T => context.results.find((r) => r.tool === tool)!.data as unknown as T;
const labels = ["Start", "Validate the incoming order payload", "Is the customer verified?", "Ship the order"];
const kinds = ["terminal", "process", "decision", "process"] as const;

describe("design-first drawing", () => {
  it("plans geometry, draws exactly the plan, reviews the result and stops when it is good", async () => {
    const { run, mem, turns } = await scriptedRun({
      prompt: "Draw the order flow: start, validate the payload, check the customer, ship",
      board: { viewport: { zoom: 1, pan: { x: 0, y: 0 }, width: 1200, height: 900 } },
      script: [
        reply("Planning the layout.", [call("plan_layout", { nodes: labels.map((label, i) => ({ label, kind: kinds[i] })), lanes: 1 })]),
        (c) => {
          const plan = dataOf<Plan>(c, "plan_layout");
          return reply("Drawing.", [
            ...labels.map((label, i) => call(i === 0 ? "create_shape" : "create_semantic_node", i === 0 ? { id: `n${i}`, shape: "pill", label, ...plan.slots[i], snap: false } : { id: `n${i}`, label, x: plan.slots[i].x, y: plan.slots[i].y, width: plan.slots[i].width, height: plan.slots[i].height, snap: false })),
            call("create_connector", { from: "n0", to: "n1" }),
            call("create_connector", { from: "n1", to: "n2" }),
            call("create_connector", { from: "n2", to: "n3", label: "Yes" }),
          ]);
        },
        reply("Checking the result.", [call("review_layout")]),
        reply("The order flow is drawn."),
      ],
    });
    expect(run.status).toBe("done");
    expect(run.results.filter((r) => !r.ok).map((r) => `${r.tool}:${r.error?.message}`)).toEqual([]);
    const plan = JSON.parse(run.messages.find((m) => m.role === "tool" && (m as { name?: string }).name === "plan_layout")!.content as string).data as Plan;
    plan.slots.forEach((slot, i) => expect(boxOf(find<DrawingElement>(mem.stored, `n${i}`))).toMatchObject({ x: slot.x, y: slot.y }));
    const review = run.results.find((r) => r.tool === "review_layout")!.data as { verdict: string };
    expect(review.verdict).toBe("good");
    expect(turns[0].system).toContain("plan_layout");
    expect(turns[0].specs).toEqual(expect.arrayContaining(["plan_layout", "review_layout"]));
  });

  it("corrects what the review names with a targeted move, reviews again, and leaves everything else where it was", async () => {
    const { run, mem } = await scriptedRun({
      prompt: "Add a Cache next to the API",
      board: { elements: [node("api", "API", 0, 0), node("far", "Elsewhere", 1000, 600)] },
      script: [
        reply("", [enable("create", "edit"), call("create_semantic_node", { id: "cache", label: "Cache", x: 60, y: 20, width: 168, height: 78, snap: false })]),
        reply("", [call("review_layout")]),
        (c) => {
          const review = dataOf<{ verdict: string; findings: Array<{ code: string; ids: string[] }> }>(c, "review_layout");
          expect(review.verdict).toBe("needs_work");
          expect(review.findings.find((f) => f.code === "overlap")?.ids).toEqual(expect.arrayContaining(["api", "cache"]));
          return reply("Moving the cache clear.", [call("move_elements", { ids: ["cache"], dx: 260, dy: 0 })]);
        },
        reply("", [call("review_layout")]),
        reply("Added the cache."),
      ],
    });
    expect(run.status).toBe("done");
    const reviews = run.results.filter((r) => r.tool === "review_layout").map((r) => (r.data as { verdict: string; attempt: number }));
    expect(reviews.map((r) => r.attempt)).toEqual([1, 2]);
    expect(reviews[1].verdict).not.toBe("needs_work");
    expect(boxOf(find<DrawingElement>(mem.stored, "api"))).toMatchObject({ x: 0, y: 0 });
    expect(boxOf(find<DrawingElement>(mem.stored, "far"))).toMatchObject({ x: 1000, y: 600 });
  });

  it("leaves hand-placed nodes exactly where they are when automatic straightening is off", async () => {
    const script = () => [
      reply("", [call("create_semantic_node", { id: "cache", label: "Cache", x: 322, y: 150, width: 120, height: 70, snap: false })]),
      reply("", [call("create_semantic_node", { id: "db", label: "Database", x: 280, y: 420, width: 200, height: 70, snap: false })]),
      reply("", [call("create_connector", { id: "c1", from: "gw", to: "cache" }), call("create_connector", { id: "c2", from: "cache", to: "db" })]),
      reply("Added both."),
    ];
    const board = { elements: [node("gw", "Gateway", 300, 0)] };
    const off = await scriptedRun({ prompt: "Add a Cache and a Database under the Gateway", board, script: script(), autoTidy: false });
    expect(boxOf(find<DrawingElement>(off.mem.stored, "cache"))).toMatchObject({ x: 322, y: 150 });
    expect(boxOf(find<DrawingElement>(off.mem.stored, "db"))).toMatchObject({ x: 280, y: 420 });
    const on = await scriptedRun({ prompt: "Add a Cache and a Database under the Gateway", board, script: script() });
    expect(boxOf(find<DrawingElement>(on.mem.stored, "db")).x).not.toBe(280);
  });
});
