// Shared by the group, inspector and guide browser tests: a small board with a connector and loose shapes.
export type El = Record<string, any>;

export const rect = (id: string, x: number, y: number, w = 120, h = 80, extra: El = {}): El => ({
  id,
  type: "rectangle",
  points: [
    { x, y },
    { x: x + w, y: y + h },
  ],
  color: "#1f2937",
  strokeWidth: 2,
  ...extra,
});

/** A connector from A's right side to B's left side. */
export const connector = (id = "ab", from = "A", to = "B", extra: El = {}): El => ({
  id,
  type: "arrow",
  points: [
    { x: 220, y: 140 },
    { x: 400, y: 140 },
  ],
  color: "#1f2937",
  strokeWidth: 2,
  arrowHeadEnd: true,
  arrowHeadStart: false,
  routingMode: "orthogonal",
  isManuallyRouted: false,
  startConnection: { elementId: from, anchorId: `${from}-anchor-right` },
  endConnection: { elementId: to, anchorId: `${to}-anchor-left` },
  ...extra,
});

export const board = (): El[] => [rect("A", 100, 100), rect("B", 400, 100), connector(), rect("C", 250, 320), rect("D", 700, 100)];

export const byId = (els: El[], id: string) => els.find((e) => e.id === id) as El;
export const records = (els: El[]) => els.filter((e) => e.type === "group");
export const shapeIds = (els: El[]) => els.filter((e) => e.type !== "group").map((e) => e.id);
export const sorted = (a: string[]) => [...a].sort();

