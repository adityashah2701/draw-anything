import { describe, expect, it } from "vitest";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { boxOf, find, node, setup } from "../test-helpers";

describe("create_nodes", () => {
  it("makes every kind of node at exactly the given positions, in one undo step", async () => {
    const { ok, mem } = setup({ elements: [node("keep", "Existing", 0, 0)] });
    const result = await ok("create_nodes", {
      nodes: [
        { id: "start", label: "Place order", kind: "terminal", x: 303, y: 7, width: 160, height: 56 },
        { id: "check", label: "Payment OK?", kind: "decision", x: 301, y: 203, width: 200, height: 110 },
        { id: "pay", label: "Charge the card", icon: "credit-card", x: 5, y: 411, width: 200, height: 80 },
        { id: "cust", label: "Customer", kind: "icon", icon: "user", x: 600, y: 9 },
        { id: "plain", label: "Process order", x: 600, y: 300 },
      ],
    });
    expect(result.affected.created).toHaveLength(5);
    expect(mem.historyDepth().undo).toBe(1);
    expect(boxOf(find<DrawingElement>(mem.stored, "start"))).toMatchObject({ x: 303, y: 7, w: 160, h: 56 });
    expect(boxOf(find<DrawingElement>(mem.stored, "check"))).toMatchObject({ x: 301, y: 203 });
    expect(boxOf(find<DrawingElement>(mem.stored, "pay"))).toMatchObject({ x: 5, y: 411 });
    expect(find<DrawingElement>(mem.stored, "check").type).toBe("diamond");
    expect(find<DrawingElement>(mem.stored, "start").type).toBe("pill");
    expect(boxOf(find<DrawingElement>(mem.stored, "keep"))).toMatchObject({ x: 0, y: 0 });
    // The ids are usable straight away.
    await ok("connect_elements", { connections: [{ from: "start", to: "check" }, { from: "check", to: "pay", label: "No" }] });
  });

  it("is all or nothing: a bad node changes nothing", async () => {
    const { run, mem } = setup();
    const result = await run("create_nodes", { nodes: [{ id: "a", label: "A", x: 0, y: 0 }, { id: "b", label: "B", kind: "icon", x: 200, y: 0 }] });
    expect(result.ok).toBe(false);
    expect(mem.stored).toHaveLength(0);
  });

  it("reports nodes that overlap each other", async () => {
    const { ok } = setup();
    const result = await ok("create_nodes", { nodes: [{ id: "a", label: "A", x: 0, y: 0, width: 200, height: 80 }, { id: "b", label: "B", x: 50, y: 20, width: 200, height: 80 }] });
    expect(result.warnings?.join(" ")).toMatch(/overlap each other/);
  });
});
