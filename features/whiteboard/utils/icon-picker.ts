import { categoryTint, listIcons, searchIcons, type IconCategory, type IconDef } from "@/core/icons/registry";
import { validateCustomIcon } from "@/core/icons/custom-icon";
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
  business: "Business",
  media: "Media",
  devices: "Devices",
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

const iconName = (id: string) =>
  id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

/** Edge of a freshly inserted icon, in world units (it can be resized afterwards). */
export const DEFAULT_ICON_SIZE = 64;

/**
 * A standalone `icon` element centred on `center`: just the glyph, no node box and no label, so what the
 * user picked is all that lands on the board. Line icons start in their category colour (changeable with
 * the colour picker); brand marks keep their own.
 */
/** The `ai.customIcon` form of an imported icon: only the fields it has (storage JSON has no undefined). */
export const storedCustomIcon = (icon: IconDef) => ({
  id: icon.id,
  title: iconTitle(icon),
  paths: icon.paths,
  viewBox: icon.viewBox,
  ...(icon.style ? { style: icon.style } : {}),
  ...(icon.color ? { color: icon.color } : {}),
  ...(icon.strokeWidth ? { strokeWidth: icon.strokeWidth } : {}),
});

/** Whether `icon` is one the user imported (it travels inside the element) rather than a registry icon. */
export const isCustomIcon = (icon: IconDef) => icon.id.startsWith("custom-");

/**
 * A standalone `icon` element centred on `center`: just the glyph, no node box and no label, so what the
 * user picked is all that lands on the board. Line icons start in their category colour (changeable with
 * the colour picker); brand marks keep their own.
 */
export const buildIconElement = (icon: IconDef, center: Point, id: string): DrawingElement => {
  const half = DEFAULT_ICON_SIZE / 2;
  return {
    id,
    type: "icon",
    points: [
      { x: center.x - half, y: center.y - half },
      { x: center.x + half, y: center.y + half },
    ],
    color: icon.color ?? categoryTint(icon.category),
    strokeWidth: icon.strokeWidth ?? 2,
    ai: isCustomIcon(icon) ? { customIcon: storedCustomIcon(icon) } : { icon: icon.id },
  } as DrawingElement;
};

const RECENT_KEY = "draw-anything:recent-icons";
export const MAX_RECENT_ICONS = 10;

/** Ids of the icons the user picked most recently, newest first. Unreadable storage gives none. */
export const loadRecentIconIds = (): string[] => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT_ICONS) : [];
  } catch {
    return [];
  }
};

/** `id` moved to the front of `existing`, once, capped. Pure: callers persist it with `saveRecentIconIds`. */
export const withRecentIcon = (existing: readonly string[], id: string): string[] =>
  [id, ...existing.filter((entry) => entry !== id)].slice(0, MAX_RECENT_ICONS);

export const saveRecentIconIds = (ids: readonly string[]) => {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or a full quota: recents just do not persist.
  }
};

/** The recent ids that still resolve to an icon (a registry icon, or one of the user's imports), in order. */
export const recentIcons = (ids: readonly string[], custom: readonly IconDef[]): IconDef[] => {
  const all = new Map(listIcons().map((icon) => [icon.id, icon]));
  const mine = new Map(custom.map((icon) => [icon.id, icon]));
  return ids.flatMap((id) => all.get(id) ?? mine.get(id) ?? []);
};
