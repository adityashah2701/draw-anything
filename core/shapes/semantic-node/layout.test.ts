import { describe, expect, it } from "vitest";
import { createEstimateContext } from "@/core/text/estimate";
import { LABEL_PADDING, layoutShapeLabel } from "@/core/text/label-layout";
import { getShapeLabelRegion } from "@/core/text/label-region";
import { sizeSemanticNode } from "@/core/text/node-size";
import {
  layoutSemanticNode,
  SEMANTIC_AUTO_ICON_MAX,
  SEMANTIC_ICON_GAP,
  SEMANTIC_INSET_WIDTH,
  SEMANTIC_MIN_ICON,
  SEMANTIC_MIN_TEXT_WIDTH,
  SEMANTIC_PADDING,
  semanticMinSize,
  semanticZoneAt,
} from "./layout";

const box = (width: number, height: number, minX = 100, minY = 50) => ({ minX, minY, width, height });

describe("the default node (168 x 78, what the AI compiler makes)", () => {
  const layout = layoutSemanticNode(box(168, 78));

  it("shows a large icon, left, vertically centred, one padding in from the border", () => {
    expect(layout.placement).toBe("left");
    expect(layout.icon).toEqual({ cx: 100 + SEMANTIC_PADDING + SEMANTIC_AUTO_ICON_MAX / 2, cy: 50 + 39, size: SEMANTIC_AUTO_ICON_MAX });
  });

  it("puts the icon noticeably larger than the old 28px tile (a 17px glyph)", () => {
    expect(layout.icon!.size).toBeGreaterThanOrEqual(36);
  });

  it("starts the text one gap after the icon and runs it to one padding before the right border", () => {
    expect(layout.text.x).toBe(100 + SEMANTIC_PADDING + SEMANTIC_AUTO_ICON_MAX + SEMANTIC_ICON_GAP);
    expect(layout.text.x + layout.text.width).toBe(100 + 168 - SEMANTIC_PADDING);
    expect(layout.text.y).toBe(50 + SEMANTIC_PADDING);
    expect(layout.text.height).toBe(78 - 2 * SEMANTIC_PADDING);
    expect(layout.align).toBe("left");
  });

  it("gives the text more room than before (it used to wrap in 78px of a 168px node)", () => {
    expect(layout.text.width - 0).toBeGreaterThan(78);
  });
});

describe("label region", () => {
  it("is the text box grown by the label layout's padding, so the layout lands exactly on the text box", () => {
    for (const [w, h] of [[168, 78], [240, 120], [130, 60], [90, 110]]) {
      const layout = layoutSemanticNode(box(w, h));
      const region = getShapeLabelRegion("semantic-node", { minX: 100, minY: 50, maxX: 100 + w, maxY: 50 + h, width: w, height: h });
      expect(region.width - 2 * LABEL_PADDING).toBeCloseTo(layout.text.width, 9);
      expect(region.height - 2 * LABEL_PADDING).toBeCloseTo(layout.text.height, 9);
      expect(region.centerX).toBeCloseTo(layout.text.x + layout.text.width / 2, 9);
      expect(region.centerY).toBeCloseTo(layout.text.y + layout.text.height / 2, 9);
      expect(region.align).toBe(layout.align);
      expect(region.maxLines).toBe(4);
    }
  });

  it("follows the node's style: a hidden icon frees the whole width", () => {
    const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 78, width: 200, height: 78 };
    const withIcon = getShapeLabelRegion("semantic-node", bounds);
    const without = getShapeLabelRegion("semantic-node", bounds, { iconHidden: true });
    expect(without.width).toBeGreaterThan(withIcon.width);
    expect(without.align).toBe("center");
    expect(withIcon.align).toBe("left");
  });

  it("leaves every other shape's region alone", () => {
    const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 };
    expect(getShapeLabelRegion("rectangle", bounds, { iconHidden: true })).toEqual({ centerX: 100, centerY: 50, width: 200, height: 100 });
    expect(getShapeLabelRegion("ellipse", bounds).align).toBeUndefined();
    expect(getShapeLabelRegion("pill", bounds).align).toBeUndefined();
  });
});

describe("node sizing is still the inverse of the layout", () => {
  const input = { fontSize: 17, fontWeight: "600", minWidth: 168, maxWidth: 280, minHeight: 78 };
  const LABELS = [
    "API",
    "Database",
    "Authentication service gateway",
    "Primary PostgreSQL database cluster (eu-west-1)",
    "Lock account for 15 minutes and notify the user by email",
    "Send one-time code\nby SMS or authenticator app",
    "one\ntwo\nthree\nfour",
  ];

  it("a default node spends exactly SEMANTIC_INSET_WIDTH beside its text", () => {
    const layout = layoutSemanticNode(box(168, 78));
    expect(168 - layout.text.width - SEMANTIC_PADDING).toBe(SEMANTIC_INSET_WIDTH + SEMANTIC_PADDING);
  });

  it.each(LABELS)("%j fits the lines it was sized for, at the requested font size, with no clipping", (label) => {
    const size = sizeSemanticNode({ ...input, label });
    const region = layoutSemanticNode(box(size.width, size.height)).region;
    const laid = layoutShapeLabel(createEstimateContext(), {
      label,
      boxWidth: region.width,
      boxHeight: region.height,
      fontSize: 17,
      fontWeight: "600",
      maxLines: region.maxLines,
    })!;
    expect(laid.fits).toBe(true);
    expect(laid.fontSize).toBe(17);
    expect(laid.lines).toHaveLength(size.lineCount);
    expect(laid.brokenWord).toBe(false);
    // The text block stays inside the text box on both axes.
    expect(laid.width).toBeLessThanOrEqual(layoutSemanticNode(box(size.width, size.height)).text.width + 1e-6);
    expect(laid.height).toBeLessThanOrEqual(layoutSemanticNode(box(size.width, size.height)).text.height + 1e-6);
  });
});

describe("adapting to the node's proportions", () => {
  it("stacks the icon above the label in a narrow, tall node", () => {
    const layout = layoutSemanticNode(box(104, 120));
    expect(layout.placement).toBe("top");
    expect(layout.icon!.cx).toBe(100 + 52);
    expect(layout.align).toBe("center");
    expect(layout.text.y).toBeGreaterThan(layout.icon!.cy + layout.icon!.size / 2);
    expect(layout.text.width).toBe(104 - 2 * SEMANTIC_PADDING);
  });

  it("keeps the icon beside the label in a wide node, however tall", () => {
    expect(layoutSemanticNode(box(240, 160)).placement).toBe("left");
  });

  it("a narrow but short node keeps the icon beside the label, smaller, instead of stacking", () => {
    const layout = layoutSemanticNode(box(116, 56));
    expect(layout.placement).toBe("left");
    expect(layout.icon!.size).toBeLessThan(SEMANTIC_AUTO_ICON_MAX);
    expect(layout.text.width).toBeGreaterThanOrEqual(SEMANTIC_MIN_TEXT_WIDTH);
  });

  it("an icon never bigger than the node allows: a requested size is clamped to what fits", () => {
    const layout = layoutSemanticNode(box(168, 60), { iconSize: 96 });
    expect(layout.icon!.size).toBe(60 - 2 * SEMANTIC_PADDING);
  });

  it("drops the icon when the node is too small for it, and the label takes the node", () => {
    const layout = layoutSemanticNode(box(70, 40));
    expect(layout.placement).toBe("none");
    expect(layout.icon).toBeNull();
    expect(layout.text).toEqual({ x: 100 + SEMANTIC_PADDING, y: 50 + SEMANTIC_PADDING, width: 70 - 2 * SEMANTIC_PADDING, height: 40 - 2 * SEMANTIC_PADDING });
    expect(layout.align).toBe("center");
  });

  it("honours an explicit placement", () => {
    expect(layoutSemanticNode(box(240, 120), { iconPlacement: "top" }).placement).toBe("top");
    const right = layoutSemanticNode(box(240, 78), { iconPlacement: "right" });
    expect(right.placement).toBe("right");
    expect(right.icon!.cx).toBe(100 + 240 - SEMANTIC_PADDING - right.icon!.size / 2);
    expect(right.text.x).toBe(100 + SEMANTIC_PADDING);
    expect(right.align).toBe("left");
  });

  it("falls back from a stack that does not fit to the side placement", () => {
    expect(layoutSemanticNode(box(240, 58), { iconPlacement: "top" }).placement).toBe("left");
  });

  it("a hidden icon is removed from the layout, not just left undrawn", () => {
    const layout = layoutSemanticNode(box(200, 78), { iconHidden: true });
    expect(layout.icon).toBeNull();
    expect(layout.text.width).toBe(200 - 2 * SEMANTIC_PADDING);
  });

  it("honours a chosen size and keeps the text clear of it", () => {
    const big = layoutSemanticNode(box(240, 120), { iconSize: 48 });
    expect(big.icon!.size).toBe(48);
    expect(big.text.x).toBeGreaterThanOrEqual(big.icon!.cx + 24 + SEMANTIC_ICON_GAP);
  });
});

describe("corner radius", () => {
  it("defaults to the token and never exceeds half the shorter side", () => {
    expect(layoutSemanticNode(box(168, 78)).radius).toBe(10);
    expect(layoutSemanticNode(box(168, 78), { cornerRadius: 48 }).radius).toBe(39);
    expect(layoutSemanticNode(box(20, 12), { cornerRadius: 48 }).radius).toBe(6);
    expect(layoutSemanticNode(box(168, 78), { cornerRadius: 0 }).radius).toBe(0);
  });
});

describe("minimum sizes", () => {
  it("depend on what the node shows", () => {
    expect(semanticMinSize()).toEqual({ width: 112, height: 56 });
    expect(semanticMinSize({ iconPlacement: "top" })).toEqual({ width: 88, height: 80 });
    expect(semanticMinSize({ iconHidden: true })).toEqual({ width: 72, height: 40 });
  });

  it.each([{}, { iconPlacement: "top" }, { iconPlacement: "right" }, { iconSize: 48 }, { iconHidden: true }])(
    "a node at its minimum still shows its icon (unless hidden) and a usable text box: %j",
    (style) => {
      const min = semanticMinSize(style);
      const layout = layoutSemanticNode(box(min.width, min.height), style);
      if ((style as { iconHidden?: boolean }).iconHidden) expect(layout.icon).toBeNull();
      else expect(layout.icon!.size).toBeGreaterThanOrEqual(SEMANTIC_MIN_ICON);
      expect(layout.text.width).toBeGreaterThanOrEqual(Math.min(SEMANTIC_MIN_TEXT_WIDTH, min.width - 2 * SEMANTIC_PADDING));
      expect(layout.text.height).toBeGreaterThanOrEqual(16);
    },
  );
});

describe("invariants over every size and style", () => {
  const styles = [
    undefined,
    {},
    { iconPlacement: "left" },
    { iconPlacement: "right" },
    { iconPlacement: "top" },
    { iconSize: 12 },
    { iconSize: 96 },
    { iconHidden: true },
    { cornerRadius: 48 },
    { iconSize: "junk", iconPlacement: 7, cornerRadius: NaN },
  ];

  it("never overflows, overlaps or produces NaN, for any node from tiny to huge", () => {
    for (const style of styles) {
      for (const w of [0, 1, 20, 56, 72, 96, 112, 120, 168, 240, 600]) {
        for (const h of [0, 1, 20, 40, 56, 72, 78, 120, 400]) {
          const layout = layoutSemanticNode(box(w, h, -30, 15), style);
          const where = `${JSON.stringify(style)} ${w}x${h}`;
          const numbers = [layout.text.x, layout.text.y, layout.text.width, layout.text.height, layout.radius, layout.region.centerX, layout.region.centerY, layout.region.width, layout.region.height, ...(layout.icon ? [layout.icon.cx, layout.icon.cy, layout.icon.size] : [])];
          expect(numbers.every(Number.isFinite), where).toBe(true);
          expect(layout.text.width, where).toBeGreaterThanOrEqual(0);
          expect(layout.text.height, where).toBeGreaterThanOrEqual(0);
          if (layout.text.width > 0 && layout.text.height > 0) {
            expect(layout.text.x, where).toBeGreaterThanOrEqual(-30 - 1e-9);
            expect(layout.text.x + layout.text.width, where).toBeLessThanOrEqual(-30 + w + 1e-9);
            expect(layout.text.y, where).toBeGreaterThanOrEqual(15 - 1e-9);
            expect(layout.text.y + layout.text.height, where).toBeLessThanOrEqual(15 + h + 1e-9);
          }
          if (layout.icon) {
            const half = layout.icon.size / 2;
            expect(layout.icon.size, where).toBeGreaterThanOrEqual(SEMANTIC_MIN_ICON);
            expect(layout.icon.cx - half, where).toBeGreaterThanOrEqual(-30 + SEMANTIC_PADDING - 1e-9);
            expect(layout.icon.cx + half, where).toBeLessThanOrEqual(-30 + w - SEMANTIC_PADDING + 1e-9);
            expect(layout.icon.cy - half, where).toBeGreaterThanOrEqual(15 + SEMANTIC_PADDING - 1e-9);
            expect(layout.icon.cy + half, where).toBeLessThanOrEqual(15 + h - SEMANTIC_PADDING + 1e-9);
            // The icon and the text never overlap.
            const apart =
              layout.icon.cx + half <= layout.text.x + 1e-9 ||
              layout.text.x + layout.text.width <= layout.icon.cx - half + 1e-9 ||
              layout.icon.cy + half <= layout.text.y + 1e-9 ||
              layout.text.y + layout.text.height <= layout.icon.cy - half + 1e-9;
            expect(apart, where).toBe(true);
          }
        }
      }
    }
  });

  it("tolerates non-finite boxes", () => {
    const layout = layoutSemanticNode({ minX: Number.NaN, minY: Number.POSITIVE_INFINITY, width: Number.NaN, height: -5 });
    expect(Number.isFinite(layout.text.width)).toBe(true);
    expect(layout.icon).toBeNull();
  });
});

describe("semanticZoneAt: where a double-click lands", () => {
  const node = box(168, 78);
  const layout = layoutSemanticNode(node);

  it("is the icon on the icon (with a little slop) and the label everywhere else", () => {
    expect(semanticZoneAt(node, undefined, { x: layout.icon!.cx, y: layout.icon!.cy })).toBe("icon");
    expect(semanticZoneAt(node, undefined, { x: layout.icon!.cx + layout.icon!.size / 2 + 3, y: layout.icon!.cy })).toBe("icon");
    expect(semanticZoneAt(node, undefined, { x: layout.text.x + 20, y: layout.text.y + 20 })).toBe("label");
    expect(semanticZoneAt(node, undefined, { x: 100 + 160, y: 50 + 70 })).toBe("label");
  });

  it("is always the label when the icon is hidden or too small to show", () => {
    expect(semanticZoneAt(node, { iconHidden: true }, { x: layout.icon!.cx, y: layout.icon!.cy })).toBe("label");
    expect(semanticZoneAt(box(60, 40), undefined, { x: 130, y: 70 })).toBe("label");
  });
});
