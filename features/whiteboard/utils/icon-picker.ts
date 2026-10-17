import { categoryTint, listIcons, searchIcons, type IconCategory, type IconDef } from "@/core/icons/registry";
import { tint } from "@/core/color/named-colors";
import { validateCustomIcon } from "@/core/icons/custom-icon";
import { sizeSemanticNode } from "@/core/text/node-size";
import type { DrawingElement, Point } from "@/features/whiteboard/types/whiteboard.types";

export const ICON_CATEGORY_LABELS: Record<IconCategory, string> = {
  compute: "Compute",
  data: "Data",
  network: "Network",
  security: "Security",
  client: "Clients",
  devops: "DevOps",
  ai: "AI",
  observability: "Observability",
  hardware: "Hardware",
  flow: "Flow",
  logo: "Logos",
  generic: "General",
};

/** The picker's extra tab for icons the user imported. */
export type PickerCategory = IconCategory | "custom";

/** Categories that have at least one icon, in label order. */
export const iconCategories = (): IconCategory[] =>
  [...new Set(listIcons().map((icon) => icon.category))].sort((a, b) =>
    ICON_CATEGORY_LABELS[a].localeCompare(ICON_CATEGORY_LABELS[b]),
  );

export const iconTitle = (icon: IconDef) => icon.title ?? iconName(icon.id);

/**
 * Icons for the picker: the user's own first, then ranked matches (ids and aliases such as "postgres")
 * when searching, else everything by name. Search also matches logo titles ("Postgre").
 */
export const pickerIcons = (query: string, category: PickerCategory | null, custom: IconDef[] = []): IconDef[] => {
  const q = query.trim().toLowerCase();
  const mine = category === null || category === "custom" ? custom.filter((icon) => !q || iconTitle(icon).toLowerCase().includes(q)) : [];
  if (category === "custom") return mine;
  const all = listIcons();
  const byId = new Map(all.map((icon) => [icon.id, icon]));
  const found = q
    ? [
        ...new Map(
          [
            ...searchIcons(query, all.length).flatMap((match) => byId.get(match.id) ?? []),
            ...all.filter((icon) => iconTitle(icon).toLowerCase().includes(q)),
          ].map((icon) => [icon.id, icon]),
        ).values(),
      ]
    : [...all].sort((a, b) => iconTitle(a).localeCompare(iconTitle(b)));
  return [...mine, ...(category ? found.filter((icon) => icon.category === category) : found)];
};

const CUSTOM_KEY = "draw-anything:custom-icons";
const MAX_SAVED_CUSTOM = 40;

/** The user's imported icons from this browser; anything unreadable or malformed is dropped. */
export const loadCustomIcons = (): IconDef[] => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.flatMap((entry) => validateCustomIcon(entry) ?? []).slice(0, MAX_SAVED_CUSTOM) : [];
  } catch {
    return [];
  }
};

/** Newest first, one entry per id. Returns the list actually kept. */
export const rememberCustomIcon = (icon: IconDef, existing: IconDef[]): IconDef[] => {
  const next = [icon, ...existing.filter((entry) => entry.id !== icon.id)].slice(0, MAX_SAVED_CUSTOM);
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the icon still works for this session.
  }
  return next;
};

export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/** Where focus goes in a row-major grid; it stops at the edges instead of wrapping. */
export const moveGridIndex = (index: number, key: GridKey, columns: number, count: number): number => {
  if (count <= 0) return -1;
  const last = count - 1;
  switch (key) {
    case "ArrowLeft": return Math.max(0, index - 1);
    case "ArrowRight": return Math.min(last, index + 1);
    case "ArrowUp": return index - columns >= 0 ? index - columns : index;
    case "ArrowDown": return index + columns <= last ? index + columns : index;
    case "Home": return 0;
    case "End": return last;
  }
};

export const iconName = (id: string) =>
  id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

/** A semantic node showing the icon, centred on `center`: the same element the AI compiler draws, so it moves, resizes and exports like one. */
export const buildIconNode = (icon: IconDef, center: Point, id: string): DrawingElement => {
  const label = iconTitle(icon);
  const { width, height } = sizeSemanticNode({ label, fontSize: 17, fontWeight: "600", minWidth: 140, maxWidth: 260, minHeight: 78 });
  const color = icon.color ?? categoryTint(icon.category);
  const custom = icon.id.startsWith("custom-");
  return {
    id,
    type: "semantic-node",
    points: [
      { x: center.x - width / 2, y: center.y - height / 2 },
      { x: center.x + width / 2, y: center.y + height / 2 },
    ],
    color,
    strokeWidth: 2,
    fill: tint(color, 0.9),
    label,
    fontSize: 17,
    fontWeight: "600",
    ai: custom
      ? {
          customIcon: {
            id: icon.id,
            title: icon.title ?? label,
            paths: icon.paths,
            viewBox: icon.viewBox,
            // Optional fields are left out, not set to undefined: storage JSON has no undefined.
            ...(icon.style ? { style: icon.style } : {}),
            ...(icon.color ? { color: icon.color } : {}),
            ...(icon.strokeWidth ? { strokeWidth: icon.strokeWidth } : {}),
          },
        }
      : { icon: icon.id },
  } as DrawingElement;
};
