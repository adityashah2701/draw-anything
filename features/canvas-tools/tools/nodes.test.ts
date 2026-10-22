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

  it("does not refuse the batch over an icon: an unknown name becomes the nearest real icon or none, and says so", async () => {
    const { ok, mem } = setup();
    const result = await ok("create_nodes", {
      nodes: [
        { id: "a", label: "API Gateway", icon: "totally-made-up-icon-zzz", x: 0, y: 0 },
        { id: "b", label: "Database", kind: "icon", x: 300, y: 0 },
        { id: "c", label: "Plain step", kind: "icon", icon: "qqqqqqqq-no-match", x: 600, y: 0 },
      ],
    });
    expect(result.affected.created).toHaveLength(3);
    expect(result.warnings?.join(" ")).toMatch(/no icon "totally-made-up-icon-zzz"/i);
    expect(find<DrawingElement>(mem.stored, "b").type).toBe("icon");
  });

  it("reads icons and kinds the way a model writes them: objects, lists, other letters, empty text, extra fields", async () => {
    const { ok, mem } = setup();
    const result = await ok("create_nodes", {
      nodes: [
        { id: "a", label: "CDN", icon: { id: "cloud", category: "infra" }, kind: "Process", x: 0, y: 0, description: "edge cache" },
        { id: "b", label: "Auth", icon: ["shield"], kind: "Decision", x: 300, y: 0 },
        { id: "c", label: "Orders", icon: "", x: 600, y: 0 },
        { id: "d", label: "DB", icon: null, kind: "terminal", x: 900, y: 0 },
      ],
    });
    expect(result.affected.created).toHaveLength(4);
    expect(find<DrawingElement>(mem.stored, "b").type).toBe("diamond");
  });

  it("reports nodes that overlap each other", async () => {
    const { ok } = setup();
    const result = await ok("create_nodes", { nodes: [{ id: "a", label: "A", x: 0, y: 0, width: 200, height: 80 }, { id: "b", label: "B", x: 50, y: 20, width: 200, height: 80 }] });
    expect(result.warnings?.join(" ")).toMatch(/overlap each other/);
  });
});
