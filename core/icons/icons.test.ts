import { afterEach, describe, expect, it, vi } from "vitest";
import { aiSemanticNodeKindSchema, normalizeIconReference, normalizeSemanticKind } from "@/features/ai/schemas";
import { drawIconTile } from "./draw";
import { GLYPHS } from "./glyphs";
import { getIcon, iconForNode, listIcons, registerIcon, resolveIconId } from "./registry";

const fakeCtx = () => {
  const calls: string[] = [];
  const target = new Proxy(
    {},
    {
      get: (_t, name: string) => (name === "measureText" ? () => ({ width: 1 }) : (..._a: unknown[]) => void calls.push(name)),
      set: (_t, name: string) => (calls.push(`set:${name}`), true),
    },
  );
  return { ctx: target as unknown as CanvasRenderingContext2D, calls };
};

describe("icon registry", () => {
  it("has a drawable glyph and a badge for every icon", () => {
    for (const icon of listIcons()) {
      expect(icon.paths.length, icon.id).toBeGreaterThan(0);
      for (const d of icon.paths) expect(d, icon.id).toMatch(/^[Mm]/);
      expect(icon.badge, icon.id).not.toBe("");
      expect(Object.values(GLYPHS)).toContain(icon.paths);
    }
  });

  it("covers every semantic kind the schema allows, so no stored board loses its icon", () => {
    for (const kind of aiSemanticNodeKindSchema.options) {
      expect(resolveIconId(kind), kind).toBeDefined();
    }
  });

  it.each([
    ["postgres", "database"],
    ["Kafka", "message-broker"],
    ["S3", "storage"],
    ["nginx", "gateway"],
    ["ESP32", "microcontroller"],
    ["CAN Bus", "bus"],
    ["i2c", "bus"],
    ["bluetooth", "bluetooth"],
  ])("resolves vendor word %s to %s", (word, id) => expect(resolveIconId(word)).toBe(id));

  it("never throws or returns undefined from getIcon, whatever the reference", () => {
    for (const bad of [undefined, null, 5, {}, "", "   ", "no-such-icon", "__proto__", "constructor"]) {
      expect(getIcon(bad).id).toBe("generic");
    }
  });

  it("an explicit icon wins over the kind; an invalid one falls back to the kind; no ai falls back to generic", () => {
    expect(iconForNode({ semanticKind: "service", icon: "kafka" }).id).toBe("message-broker");
    expect(iconForNode({ semanticKind: "database", icon: "bogus" }).id).toBe("database");
    expect(iconForNode({ semanticKind: "database" }).id).toBe("database"); // board saved before icons existed
    expect(iconForNode(undefined).id).toBe("generic");
  });

  it("is extensible: a registered pack icon and its alias resolve", () => {
    registerIcon({ id: "test-pack-x", category: "hardware", paths: ["M0 0L24 24"], viewBox: { width: 24, height: 24 }, badge: "X" }, "Pack X");
    expect(resolveIconId("pack x")).toBe("test-pack-x");
  });
});

describe("model references", () => {
  it("maps vendor words to a kind and stores an icon only when it adds information", () => {
    expect(normalizeSemanticKind("kafka")).toBe("message-broker");
    expect(normalizeSemanticKind("postgres")).toBe("database");
    expect(normalizeSemanticKind("totally-unknown")).toBe("generic");
    expect(normalizeIconReference(["postgres"], "database")).toBeUndefined();
    expect(normalizeIconReference(["esp32"], "generic")).toBe("microcontroller");
    expect(normalizeIconReference([undefined, "nonsense"], "service")).toBeUndefined();
    expect(normalizeIconReference(["nonsense", "redis"], "service")).toBe("cache");
  });
});

describe("drawIconTile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("strokes the glyph path when Path2D exists", () => {
    vi.stubGlobal("Path2D", class { addPath() {} });
    const { ctx, calls } = fakeCtx();
    drawIconTile(ctx, getIcon("database"), 50, 50, 28);
    expect(calls).toContain("stroke");
    expect(calls).not.toContain("fillText");
  });

  it("falls back to the text badge when Path2D is missing, and still draws the tile", () => {
    vi.stubGlobal("Path2D", undefined);
    const { ctx, calls } = fakeCtx();
    drawIconTile(ctx, getIcon("database"), 50, 50, 28);
    expect(calls).toContain("fillText");
    expect(calls).toContain("roundRect");
  });

  it("falls back to the badge when the path data is rejected", () => {
    vi.stubGlobal("Path2D", class { constructor() { throw new Error("bad path"); } });
    const { ctx, calls } = fakeCtx();
    drawIconTile(ctx, { ...getIcon("api"), id: "broken", paths: ["???"] }, 0, 0, 28);
    expect(calls).toContain("fillText");
  });
});

import { searchIcons } from "./registry";

describe("searchIcons", () => {
  it("ranks the exact id first, then aliases", () => {
    expect(searchIcons("database")[0]).toMatchObject({ id: "database", via: "id" });
    expect(searchIcons("postgres")[0]).toMatchObject({ id: "database", via: "alias" });
    expect(searchIcons("Kafka")[0].id).toBe("message-broker");
    expect(searchIcons("esp32")[0].id).toBe("microcontroller");
  });

  it("finds by prefix, substring and shared words, capped by limit", () => {
    expect(searchIcons("load")[0].id).toBe("load-balancer");
    expect(searchIcons("balancer").map((m) => m.id)).toContain("load-balancer");
    expect(searchIcons("message queue", 3).length).toBeLessThanOrEqual(3);
    expect(searchIcons("security").map((m) => m.category)).toContain("security");
  });

  it("is total: junk, empty, huge and prototype keys never throw", () => {
    for (const bad of [undefined, null, 5, {}, "", "   ", "zzzzzzzz", "__proto__", "constructor", "x".repeat(10_000)]) {
      expect(Array.isArray(searchIcons(bad))).toBe(true);
    }
    expect(searchIcons("database", 0)).toEqual([]);
  });
});
