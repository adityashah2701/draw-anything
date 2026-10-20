import { describe, expect, it } from "vitest";
import type { FrameShape } from "@/features/whiteboard/types/whiteboard.types";
import { FRAME_DEFAULTS, enforceMinimumSize, frameBox, frameRegions, hasValidBox, headerAllowance, isFrameShape, resolveFrame } from "./frame-model";
import { frame } from "./test-helpers";

describe("resolveFrame (migration defaults)", () => {
  it("gives a frame with no optional field the design defaults", () => {
    const minimal = { id: "f", type: "frame", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: "#000", strokeWidth: 1 } as FrameShape;
    expect(resolveFrame(minimal)).toEqual({
      title: "Frame",
      padding: FRAME_DEFAULTS.padding,
      cornerRadius: FRAME_DEFAULTS.cornerRadius,
      titlePlacement: "inside",
      headerVisible: true,
      autoFit: false,
      minWidth: FRAME_DEFAULTS.minWidth,
      minHeight: FRAME_DEFAULTS.minHeight,
      preset: undefined,
      opacity: 1,
    });
  });

  it("clamps or ignores corrupt values instead of trusting them", () => {
    const corrupt = frame("f", 0, 0, 100, 100, {
      title: "   ",
      padding: -5,
      cornerRadius: Number.NaN,
      titlePlacement: "sideways" as never,
      minWidth: 1e9,
      preset: "nope" as never,
      opacity: 7,
    });
    const r = resolveFrame(corrupt);
    expect(r.title).toBe("Frame");
    expect(r.padding).toBe(0);
    expect(r.cornerRadius).toBe(FRAME_DEFAULTS.cornerRadius);
    expect(r.titlePlacement).toBe("inside");
    expect(r.minWidth).toBe(10_000);
    expect(r.preset).toBeUndefined();
    expect(r.opacity).toBe(1);
  });

  it("trims and bounds the title", () => {
    expect(resolveFrame(frame("f", 0, 0, 100, 100, { title: "  Billing  " })).title).toBe("Billing");
    expect(resolveFrame(frame("f", 0, 0, 100, 100, { title: "x".repeat(500) })).title).toHaveLength(200);
  });
});

describe("frame geometry", () => {
  it("normalises reversed corners and rejects non-finite ones", () => {
    const reversed = frame("f", 0, 0, 100, 50);
    reversed.points = [reversed.points[1], reversed.points[0]];
    expect(frameBox(reversed)).toMatchObject({ minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 });
    const bad = frame("f", 0, 0, 100, 50);
    bad.points = [{ x: 0, y: 0 }, { x: Number.NaN, y: 4 }];
    expect(frameBox(bad)).toBeNull();
    expect(hasValidBox(bad)).toBe(false);
    expect(frameBox({ ...bad, points: [] })).toBeNull();
  });

  it("puts an inside header in a band at the top and the content below it", () => {
    const regions = frameRegions(frame("f", 10, 20, 200, 100))!;
    expect(regions.header).toMatchObject({ minY: 20, maxY: 20 + FRAME_DEFAULTS.headerHeight, minX: 10, maxX: 210 });
    expect(regions.content).toMatchObject({ minY: 20 + FRAME_DEFAULTS.headerHeight, maxY: 120 });
  });

  it("keeps the whole box as content for an above tab, and puts the tab outside the box", () => {
    const regions = frameRegions(frame("f", 10, 20, 200, 100, { titlePlacement: "above", title: "Auth" }))!;
    expect(regions.content).toEqual(regions.box);
    expect(regions.header!.maxY).toBe(20);
    expect(regions.header!.minY).toBe(20 - FRAME_DEFAULTS.tabHeight);
    expect(regions.header!.width).toBeLessThanOrEqual(200);
  });

  it("has no header region when the header is hidden", () => {
    const regions = frameRegions(frame("f", 0, 0, 100, 100, { headerVisible: false }))!;
    expect(regions.header).toBeNull();
    expect(regions.content).toEqual(regions.box);
    expect(headerAllowance(frame("f", 0, 0, 1, 1, { headerVisible: false }))).toBe(0);
    expect(headerAllowance(frame("f", 0, 0, 1, 1))).toBe(FRAME_DEFAULTS.headerHeight);
  });

  it("never lets a short frame's header leave its box", () => {
    const regions = frameRegions(frame("f", 0, 0, 100, 10))!;
    expect(regions.header!.maxY).toBe(10);
  });

  it("grows a too-small box to the minimum, keeping its corner", () => {
    const f = frame("f", 5, 5, 10, 10);
    expect(enforceMinimumSize(f, frameBox(f)!)).toMatchObject({ minX: 5, minY: 5, width: FRAME_DEFAULTS.minWidth, height: FRAME_DEFAULTS.minHeight });
  });

  it("recognises frames and nothing else", () => {
    expect(isFrameShape(frame("f", 0, 0, 1, 1))).toBe(true);
    expect(isFrameShape({ id: "g", type: "group" })).toBe(false);
    expect(isFrameShape(null)).toBe(false);
  });
});
