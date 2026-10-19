import { beforeAll, describe, expect, it } from "vitest";
import { getIcon, iconForNode, loadIconLibrary } from "@/core/icons/registry";
import { validateCustomIcon } from "@/core/icons/custom-icon";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import {
  planLabel,
  planNodeStyle,
  planRemoveIcon,
  planReplaceIcon,
  planRestoreIcon,
  planTypography,
  readSemanticSelection,
  type SemanticNode,
} from "./semantic-node-edit";

beforeAll(loadIconLibrary);

const node = (id: string, over: Record<string, unknown> = {}): SemanticNode =>
  ({ id, type: "semantic-node", color: "#000", strokeWidth: 2, label: id, fontSize: 17, fontWeight: "600", points: [{ x: 0, y: 0 }, { x: 168, y: 78 }], ...over }) as unknown as SemanticNode;
const rect = (id: string) => ({ id, type: "rectangle", color: "#000", strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }) as unknown as DrawingElement;
const iconOf = (el: DrawingElement) => iconForNode(el.ai).id;
const only = <T,>(list: T[]) => {
  expect(list).toHaveLength(1);
  return list[0];
};

describe("replacing the icon", () => {
  it("sets the icon id and leaves the rest of the node's metadata alone", () => {
    const a = node("a", { ai: { icon: "database", semanticKind: "database", semanticId: "n1", role: "node" } });
    const [changed] = planReplaceIcon([a], getIcon("queue")) as SemanticNode[];
    expect(changed.ai).toEqual({ icon: "queue", semanticKind: "database", semanticId: "n1", role: "node" });
    expect(iconOf(changed)).toBe("queue");
    expect(changed.points).toEqual(a.points);
  });

  it("works on a node that has no icon metadata at all (older boards)", () => {
    const [changed] = planReplaceIcon([node("a")], getIcon("cache")) as SemanticNode[];
    expect(changed.ai).toEqual({ icon: "cache" });
    expect(iconOf(changed)).toBe("cache");
  });

  it("remembers the first icon so it can be restored, and keeps remembering it through later replacements", () => {
    const a = node("a", { ai: { icon: "database" } });
    const b = only(planReplaceIcon([a], getIcon("queue"))) as SemanticNode;
    expect(b.nodeStyle).toEqual({ originalIcon: "database" });
    const c = only(planReplaceIcon([b], getIcon("cache"))) as SemanticNode;
    expect(c.nodeStyle).toEqual({ originalIcon: "database" });
  });

  it("remembers 'it showed its kind's icon' as null, and records nothing when the pick is the icon it already has", () => {
    const fresh = only(planReplaceIcon([node("a")], getIcon("cache"))) as SemanticNode;
    expect(fresh.nodeStyle).toEqual({ originalIcon: null });
    expect(planReplaceIcon([node("a", { ai: { icon: "database" } })], getIcon("database"))).toEqual([]);
  });

  it("shows a hidden icon again, since picking one means wanting to see it", () => {
    const hidden = node("a", { ai: { icon: "database" }, nodeStyle: { iconHidden: true, iconSize: 32 } });
    const changed = only(planReplaceIcon([hidden], getIcon("queue"))) as SemanticNode;
    expect(changed.nodeStyle).toEqual({ iconSize: 32, originalIcon: "database" });
  });

  it("stores a user's own icon inside the node, without undefined fields", () => {
    const mine = validateCustomIcon({ id: "custom-gizmo", title: "Gizmo", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 }, style: "stroke" })!;
    const changed = only(planReplaceIcon([node("a", { ai: { icon: "database" } })], mine)) as SemanticNode;
    expect(changed.ai?.icon).toBeUndefined();
    expect(changed.ai?.customIcon).toMatchObject({ id: "custom-gizmo", title: "Gizmo", paths: ["M0 0h4v4Z"], style: "stroke" });
    expect(JSON.parse(JSON.stringify(changed))).toEqual(changed); // survives JSON storage unchanged
    expect(iconOf(changed)).toBe("custom-gizmo");
    // Switching back to a registry icon drops the custom one.
    const back = only(planReplaceIcon([changed], getIcon("api"))) as SemanticNode;
    expect(back.ai?.customIcon).toBeUndefined();
    expect(iconOf(back)).toBe("api");
  });

  it("changes only semantic nodes, however many things are selected", () => {
    const changed = planReplaceIcon([node("a"), rect("r"), node("b")], getIcon("api"));
    expect(changed.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("a brand icon from the library can be used", () => {
    const logo = getIcon("logo-github");
    expect(logo.style).toBe("logo");
    expect((only(planReplaceIcon([node("a")], logo)) as SemanticNode).ai?.icon).toBe("logo-github");
  });
});

describe("removing and restoring the icon", () => {
  it("removing hides the icon but keeps its identity", () => {
    const hidden = only(planRemoveIcon([node("a", { ai: { icon: "database" } })])) as SemanticNode;
    expect(hidden.nodeStyle).toEqual({ iconHidden: true });
    expect(hidden.ai).toEqual({ icon: "database" });
  });

  it("removing twice changes nothing the second time", () => {
    const hidden = only(planRemoveIcon([node("a")])) as SemanticNode;
    expect(planRemoveIcon([hidden])).toEqual([]);
  });

  it("restoring brings back the icon the node had, and shows it", () => {
    let a = node("a", { ai: { icon: "database", semanticKind: "database" } });
    a = only(planReplaceIcon([a], getIcon("queue"))) as SemanticNode;
    a = only(planRemoveIcon([a])) as SemanticNode;
    const restored = only(planRestoreIcon([a])) as SemanticNode;
    expect(iconOf(restored)).toBe("database");
    expect(restored.nodeStyle).toBeUndefined();
    expect(restored.ai).toEqual({ icon: "database", semanticKind: "database" });
  });

  it("restoring a node with no remembered icon falls back to the one its kind implies", () => {
    let a = node("a", { ai: { semanticKind: "queue" } });
    a = only(planReplaceIcon([a], getIcon("cache"))) as SemanticNode;
    expect(iconOf(a)).toBe("cache");
    const restored = only(planRestoreIcon([a])) as SemanticNode;
    expect(iconOf(restored)).toBe("queue");
    expect(restored.ai).toEqual({ semanticKind: "queue" });
  });

  it("restoring a node with nothing to restore is a no-op, and a custom icon is removed by it", () => {
    expect(planRestoreIcon([node("a", { ai: { icon: "database" } })])).toEqual([]);
    expect(planRestoreIcon([node("a")])).toEqual([]);
    const mine = validateCustomIcon({ id: "custom-g", title: "G", paths: ["M0 0h4v4Z"], viewBox: { width: 24, height: 24 } })!;
    const custom = only(planReplaceIcon([node("a", { ai: { semanticKind: "api" } })], mine)) as SemanticNode;
    const restored = only(planRestoreIcon([custom])) as SemanticNode;
    expect(restored.ai).toEqual({ semanticKind: "api" });
    expect(iconOf(restored)).toBe("api");
  });

  it("restoring keeps the size, placement and colour the user chose", () => {
    const a = node("a", { nodeStyle: { iconHidden: true, iconSize: 40, iconPlacement: "top", iconColor: "#dc2626" } });
    const restored = only(planRestoreIcon([a])) as SemanticNode;
    expect(restored.nodeStyle).toEqual({ iconSize: 40, iconPlacement: "top", iconColor: "#dc2626" });
  });

  it("an emptied ai object is not left behind", () => {
    const a = node("a", { ai: { icon: "queue" }, nodeStyle: { originalIcon: null } });
    const restored = only(planRestoreIcon([a])) as SemanticNode;
    expect(restored.ai).toBeUndefined();
    expect(restored.nodeStyle).toBeUndefined();
  });

  it("a removed field is written as an explicit undefined, which is what makes the storage write delete the key", () => {
    const a = node("a", { ai: { icon: "queue" }, nodeStyle: { originalIcon: null } });
    const restored = only(planRestoreIcon([a])) as SemanticNode;
    expect(Object.keys(restored)).toEqual(expect.arrayContaining(["ai", "nodeStyle"]));
    expect(restored.ai).toBeUndefined();
    // But a field the node never had is not invented.
    expect("nodeStyle" in (only(planReplaceIcon([node("b", { ai: { icon: "queue" } })], getIcon("cache"))) as SemanticNode)).toBe(true);
    expect("nodeStyle" in (only(planNodeStyle([node("c")], { iconSize: 24 })) as SemanticNode)).toBe(true);
    expect("ai" in (only(planNodeStyle([node("d")], { iconSize: 24 })) as SemanticNode)).toBe(false);
  });

  it("showing a hidden icon never changes which icon it is", () => {
    const hidden = only(planRemoveIcon([node("a", { ai: { icon: "database", semanticKind: "api" } })])) as SemanticNode;
    const shown = only(planRestoreIcon([hidden])) as SemanticNode;
    expect(shown.ai).toEqual({ icon: "database", semanticKind: "api" });
    expect(shown.nodeStyle).toBeUndefined();
  });
});

describe("style changes", () => {
  it("sets and clears individual settings", () => {
    const a = only(planNodeStyle([node("a")], { iconSize: 48, iconPlacement: "top" })) as SemanticNode;
    expect(a.nodeStyle).toEqual({ iconSize: 48, iconPlacement: "top" });
    const b = only(planNodeStyle([a], { iconSize: undefined })) as SemanticNode;
    expect(b.nodeStyle).toEqual({ iconPlacement: "top" });
    const c = only(planNodeStyle([b], { iconPlacement: undefined })) as SemanticNode;
    expect(c.nodeStyle).toBeUndefined();
  });

  it("applies to every selected node and skips ones that already match", () => {
    const changed = planNodeStyle([node("a", { nodeStyle: { cornerRadius: 4 } }), node("b")], { cornerRadius: 4 });
    expect(changed.map((c) => c.id)).toEqual(["b"]);
  });

  it("clamps what it stores", () => {
    const a = only(planNodeStyle([node("a")], { iconSize: 9999, cornerRadius: -3 })) as SemanticNode;
    expect(a.nodeStyle).toEqual({ iconSize: 96, cornerRadius: 0 });
  });

  it("a new node stored this way is plain JSON and round-trips", () => {
    const a = only(planNodeStyle([node("a")], { iconColor: "#2563eb", iconHidden: true })) as SemanticNode;
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it("typography changes weight and slant, and nothing else", () => {
    const [bold] = planTypography([node("a")], { fontWeight: "700" }) as SemanticNode[];
    expect(bold.fontWeight).toBe("700");
    expect(bold.fontStyle).toBeUndefined();
    const [italic] = planTypography([bold], { italic: true }) as SemanticNode[];
    expect(italic.fontStyle).toBe("italic");
    expect(italic.fontWeight).toBe("700");
    expect(planTypography([italic], { italic: true, fontWeight: "700" })).toEqual([]);
    const [upright] = planTypography([italic], { italic: false }) as SemanticNode[];
    expect(upright.fontStyle).toBe("normal");
  });

  it("the label text is changed only when it differs", () => {
    expect(planLabel([node("a", { label: "x" })], "x")).toEqual([]);
    expect((only(planLabel([node("a", { label: "x" })], "x\ny")) as SemanticNode).label).toBe("x\ny");
  });
});

describe("what the panel reads", () => {
  const all = [node("a", { ai: { icon: "database" } }), node("b", { ai: { icon: "queue" } }), rect("r")];
  const read = (selected: string[], locked: string[] = []) => readSemanticSelection(all, selected, (id) => locked.includes(id));

  it("is nothing when no semantic node is selected", () => {
    expect(read([])).toBeNull();
    expect(read(["r"])).toBeNull();
  });

  it("describes one node: its icon, defaults for unset settings", () => {
    const m = read(["a"])!;
    expect(m.count).toBe(1);
    expect(m.icon).toMatchObject({ id: "database", hidden: false });
    expect(m.iconSize).toBeNull();
    expect(m.iconPlacement).toBeNull();
    expect(m.iconColor).toBeNull();
    expect(m.cornerRadius).toBe(10);
    expect(m.fontWeight).toBe("600");
    expect(m.italic).toBe(false);
    expect(m.canRestore).toBe(false);
  });

  it("shows mixed values for a mixed selection and ignores non-nodes in it", () => {
    const m = read(["a", "b", "r"])!;
    expect(m.count).toBe(2);
    expect(m.icon).toBe("mixed");
    expect(m.label).toBe("mixed");
    expect(m.fontWeight).toBe("600");
  });

  it("reports a replaced or removed icon as restorable", () => {
    const replaced = readSemanticSelection([only(planReplaceIcon([all[0]], getIcon("cache"))) as SemanticNode], ["a"], () => false)!;
    expect(replaced.canRestore).toBe(true);
    const hidden = readSemanticSelection([only(planRemoveIcon([all[0]])) as SemanticNode], ["a"], () => false)!;
    expect(hidden.canRestore).toBe(true);
    expect(hidden.icon).toMatchObject({ hidden: true });
  });

  it("locked nodes are read but not editable; a partly locked selection edits the unlocked", () => {
    const locked = read(["a"], ["a"])!;
    expect(locked.locked).toBe(true);
    expect(locked.editable).toEqual([]);
    const partly = read(["a", "b"], ["a"])!;
    expect(partly.locked).toBe(false);
    expect(partly.editable).toEqual(["b"]);
    expect(partly.icon).toMatchObject({ id: "queue" }); // the panel shows what an edit would change
  });

  it("survives corrupt stored styles", () => {
    const bad = node("x", { nodeStyle: { iconSize: "huge", iconPlacement: 9, cornerRadius: Number.NaN } });
    const m = readSemanticSelection([bad], ["x"], () => false)!;
    expect(m.iconSize).toBeNull();
    expect(m.iconPlacement).toBeNull();
    expect(m.cornerRadius).toBe(10);
  });
});
