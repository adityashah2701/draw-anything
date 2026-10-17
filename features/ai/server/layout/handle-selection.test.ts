import { describe, expect, it } from "vitest";
import { chooseHandles, decisionExitHandle, type HandleNode } from "./handle-selection";

const node = (id: string, type: string, minX: number, minY: number, w = 100, h = 60): HandleNode => ({
  node: { id },
  element: { type },
  bounds: { minX, minY, maxX: minX + w, maxY: minY + h, width: w, height: h },
});

describe("decisionExitHandle", () => {
  const decision = node("d", "diamond", 200, 0);
  const yes = node("yes", "semantic-node", 200, 200);
  const no = node("no", "semantic-node", 400, 200);

  it("leaves a decision's side branch from the side it lies on, the straight one from below", () => {
    const used = new Set<string>();
    const first = decisionExitHandle(decision, yes, chooseHandles(decision, yes), 2, used);
    used.add(`d.${first.from}`);
    const second = decisionExitHandle(decision, no, chooseHandles(decision, no), 2, used);
    expect(first.from).toBe("bottom");
    expect(second.from).toBe("right");
  });

  it("falls back to the bottom when that side is already taken", () => {
    const used = new Set(["d.right"]);
    expect(decisionExitHandle(decision, no, chooseHandles(decision, no), 2, used).from).toBe("bottom");
  });

  it("leaves non-decisions and single exits alone", () => {
    const box = node("b", "semantic-node", 200, 0);
    expect(decisionExitHandle(box, no, chooseHandles(box, no), 2, new Set()).from).toBe("bottom");
    expect(decisionExitHandle(decision, no, chooseHandles(decision, no), 1, new Set()).from).toBe("bottom");
  });
});
