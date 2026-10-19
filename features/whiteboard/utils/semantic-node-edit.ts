import { iconForNode, type IconDef } from "@/core/icons/registry";
import { SEMANTIC_DEFAULT_RADIUS } from "@/core/shapes/semantic-node/layout";
import { mergeNodeStyle, normalizeNodeStyle, type NodeStylePatch } from "@/core/shapes/semantic-node/style";
import { DEFAULT_LABEL_FONT_SIZE } from "@/core/text/label-layout";
import type { DrawingElement, SemanticIconPlacement } from "@/features/whiteboard/types/whiteboard.types";
import { isCustomIcon, iconTitle, storedCustomIcon } from "./icon-picker";
import type { Mixed } from "./inspector-model";

/*
 * Editing a semantic node's icon and presentation, as pure plans: each takes the nodes and returns the
 * elements that actually change (none when nothing would), so one panel action is one storage mutation
 * and one undo step, and a no-op never lands in the history. Nothing here touches React or storage.
 */

export type SemanticNode = Extract<DrawingElement, { type: "semantic-node" }>;
type Ai = NonNullable<DrawingElement["ai"]>;

export const isSemanticNode = (element: DrawingElement): element is SemanticNode => element.type === "semantic-node";

/** Key-order-independent JSON, to tell a real change from a rewrite of the same data. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

/**
 * `node` with the given fields replaced, or null when that changes nothing. A field to remove is set to
 * `undefined` rather than dropped from the object: the storage write is a merge, and only an explicit
 * `undefined` makes it delete the key (see `writeElement` in the page controller).
 */
const changed = (node: SemanticNode, next: { ai?: Ai | undefined; nodeStyle?: ReturnType<typeof mergeNodeStyle> }): SemanticNode | null => {
  const result: Record<string, unknown> = { ...node };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) result[key] = value;
    else if (key in node) result[key] = undefined;
  }
  return stable(result) === stable(node) ? null : (result as unknown as SemanticNode);
};

/** `ai` with its icon identity cleared; the other metadata (kind, ids, role) is untouched. */
const withoutIcon = (ai: Ai | undefined): Ai => {
  const { icon: _icon, customIcon: _custom, ...rest } = ai ?? {};
  void _icon;
  void _custom;
  return rest;
};

/** An empty `ai` is dropped rather than stored. */
const orNone = (ai: Ai): Ai | undefined => (Object.keys(ai).length > 0 ? ai : undefined);

const nodesOf = (elements: readonly DrawingElement[]) => elements.filter(isSemanticNode);

/**
 * Replaces the icon. What the node showed before is remembered once (`originalIcon`: its icon id, or null
 * when it showed its kind's icon) so "restore default" can bring it back, and a hidden icon is shown
 * again, since choosing one means wanting to see it.
 */
export const planReplaceIcon = (elements: readonly DrawingElement[], icon: IconDef): DrawingElement[] =>
  nodesOf(elements).flatMap((node) => {
    const current = normalizeNodeStyle(node.nodeStyle);
    const ai: Ai = { ...withoutIcon(node.ai), ...(isCustomIcon(icon) ? { customIcon: storedCustomIcon(icon) } : { icon: icon.id }) };
    // The first icon wins: replacing A with B and then B with C still restores to A.
    let remembered = current.originalIcon;
    if (remembered === undefined && node.ai?.customIcon === undefined) {
      const previous = typeof node.ai?.icon === "string" ? node.ai.icon : null;
      remembered = previous === icon.id ? undefined : previous;
    }
    const next = changed(node, {
      ai,
      nodeStyle: mergeNodeStyle(current, { iconHidden: undefined, originalIcon: remembered }),
    });
    return next ? [next] : [];
  });

/** Hides the icon (the label then takes the whole node). The icon itself is kept, so it can come back. */
export const planRemoveIcon = (elements: readonly DrawingElement[]): DrawingElement[] =>
  nodesOf(elements).flatMap((node) => {
    const next = changed(node, { nodeStyle: mergeNodeStyle(node.nodeStyle, { iconHidden: true }) });
    return next ? [next] : [];
  });

/**
 * Back to the node's default icon, and visible: the icon it had before it was replaced (or its kind's icon
 * when it had none). A node whose icon was never replaced keeps the icon it has, since that is its default;
 * a user-imported icon is dropped. Size, placement and colour are separate settings and stay.
 */
export const planRestoreIcon = (elements: readonly DrawingElement[]): DrawingElement[] =>
  nodesOf(elements).flatMap((node) => {
    const original = normalizeNodeStyle(node.nodeStyle).originalIcon;
    const { customIcon: _custom, ...withoutCustom } = node.ai ?? {};
    void _custom;
    const base = withoutIcon(node.ai);
    const ai: Ai | undefined =
      typeof original === "string" ? { ...base, icon: original } : original === null ? orNone(base) : orNone(withoutCustom);
    const next = changed(node, {
      ai,
      nodeStyle: mergeNodeStyle(node.nodeStyle, { iconHidden: undefined, originalIcon: undefined }),
    });
    return next ? [next] : [];
  });

/** Icon size, placement, colour, visibility and corner radius; a `undefined` field goes back to the default. */
export const planNodeStyle = (elements: readonly DrawingElement[], patch: NodeStylePatch): DrawingElement[] =>
  nodesOf(elements).flatMap((node) => {
    const next = changed(node, { nodeStyle: mergeNodeStyle(node.nodeStyle, patch) });
    return next ? [next] : [];
  });

/** The label text, for the panel's text field. */
export const planLabel = (elements: readonly DrawingElement[], label: string): DrawingElement[] =>
  nodesOf(elements).flatMap((node) => ((node.label ?? "") === label ? [] : [{ ...node, label }]));

/** Label weight and slant for the selected nodes; fields left out are not touched. */
export const planTypography = (
  elements: readonly DrawingElement[],
  change: { fontWeight?: string; italic?: boolean },
): DrawingElement[] =>
  nodesOf(elements).flatMap((node) => {
    const next: SemanticNode = {
      ...node,
      ...(change.fontWeight !== undefined ? { fontWeight: change.fontWeight } : {}),
      ...(change.italic !== undefined ? { fontStyle: change.italic ? "italic" : "normal" } : {}),
    };
    return stable(next) === stable(node) ? [] : [next];
  });

export interface SemanticSelectionModel {
  /** Semantic nodes in the selection, locked or not. */
  count: number;
  /** The ones an edit applies to. */
  editable: string[];
  locked: boolean;
  /** The icon the node draws (its name), or "mixed". `hidden` when the icon is removed. */
  icon: Mixed<{ id: string; title: string; hidden: boolean; def: IconDef }>;
  /** True when some node differs from its default icon (replaced, removed): "restore" has something to do. */
  canRestore: boolean;
  /** Icon tile edge in world units; null = automatic. */
  iconSize: Mixed<number | null>;
  iconPlacement: Mixed<SemanticIconPlacement | null>;
  iconColor: Mixed<string | null>;
  cornerRadius: Mixed<number>;
  fontWeight: Mixed<string>;
  italic: Mixed<boolean>;
  fontSize: Mixed<number>;
  label: Mixed<string>;
}

const same = <T>(values: readonly T[]): Mixed<T> => (values.every((v) => v === values[0]) ? values[0] : "mixed");

/** What the panel shows for the selected semantic nodes, or null when none is selected. */
export const readSemanticSelection = (
  elements: readonly DrawingElement[],
  selected: readonly string[],
  isLocked: (id: string) => boolean,
): SemanticSelectionModel | null => {
  const wanted = new Set(selected);
  const all = nodesOf(elements).filter((node) => wanted.has(node.id));
  if (all.length === 0) return null;
  const editable = all.filter((node) => !isLocked(node.id));
  const basis = editable.length > 0 ? editable : all;
  const styles = basis.map((node) => normalizeNodeStyle(node.nodeStyle));

  const iconOf = (node: SemanticNode, hidden: boolean) => {
    const def = iconForNode(node.ai);
    return { id: def.id, title: iconTitle(def), hidden, def };
  };
  const icons = basis.map((node, i) => iconOf(node, styles[i].iconHidden === true));
  const icon = same(icons.map((entry) => `${entry.id}|${entry.hidden}`));

  return {
    count: all.length,
    editable: editable.map((node) => node.id),
    locked: editable.length === 0,
    icon: icon === "mixed" ? "mixed" : icons[0],
    canRestore: basis.some((node, i) => styles[i].iconHidden === true || styles[i].originalIcon !== undefined || node.ai?.customIcon !== undefined),
    iconSize: same(styles.map((s) => s.iconSize ?? null)),
    iconPlacement: same(styles.map((s) => s.iconPlacement ?? null)),
    iconColor: same(styles.map((s) => s.iconColor ?? null)),
    cornerRadius: same(styles.map((s) => s.cornerRadius ?? SEMANTIC_DEFAULT_RADIUS)),
    fontWeight: same(basis.map((node) => String(node.fontWeight ?? "600"))),
    italic: same(basis.map((node) => node.fontStyle === "italic")),
    fontSize: same(basis.map((node) => node.fontSize ?? DEFAULT_LABEL_FONT_SIZE)),
    label: same(basis.map((node) => node.label ?? "")),
  };
};
