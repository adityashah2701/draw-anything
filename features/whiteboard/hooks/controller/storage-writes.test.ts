import { LiveList, LiveObject } from "@liveblocks/client";
import { describe, expect, it } from "vitest";
import type { DrawingElementJson } from "@/liveblocks.config";
import { pushElement, writeElement } from "./storage-writes";

const json = (id: string, x: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: "rectangle", color: "#000000", strokeWidth: 2, points: [{ x, y: 0 }, { x: x + 100, y: 60 }], ...extra }) as unknown as DrawingElementJson;
const read = (live: LiveObject<DrawingElementJson>) => live.toImmutable() as unknown as Record<string, unknown>;

describe("the storage boundary", () => {
  it("stamps a move user, and a layout's own move auto, in the same write as the position", () => {
    const live = new LiveObject(json("a", 0, { placement: "auto" }));
    writeElement(live, json("a", 40));
    expect(read(live).placement).toBe("user");
    writeElement(live, json("a", 80), "layout");
    expect(read(live).placement).toBe("auto");
    expect((read(live).points as Array<{ x: number }>)[0].x).toBe(80);
  });

  it("leaves the stamp alone when nothing moved, whatever a stale copy says", () => {
    const live = new LiveObject(json("a", 0, { placement: "user" }));
    writeElement(live, json("a", 0, { placement: "auto", label: "hi" }));
    expect(read(live)).toMatchObject({ placement: "user", label: "hi" });
  });

  it("keeps clearing a field written as undefined", () => {
    const live = new LiveObject(json("a", 0, { label: "gone", placement: "user" }));
    writeElement(live, json("a", 0, { label: undefined }));
    expect("label" in read(live)).toBe(false);
  });

  it("stamps new elements, by origin and by override, and never a connector", () => {
    const list = new LiveList<LiveObject<DrawingElementJson>>([]);
    pushElement(list, json("a", 0));
    pushElement(list, json("b", 0), "layout");
    pushElement(list, json("c", 0), "layout", "user");
    pushElement(list, { ...json("e", 0), type: "arrow" } as unknown as DrawingElementJson, "layout");
    expect(list.map((o) => read(o).placement)).toEqual(["user", "auto", "user", undefined]);
  });
});
