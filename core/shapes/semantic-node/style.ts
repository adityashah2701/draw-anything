import type { SemanticIconPlacement, SemanticNodeStyle } from "@/features/whiteboard/types/whiteboard.types";

/*
 * What a semantic node stores beyond fill/stroke/text. The stored object comes from older builds,
 * other clients and the AI, so every read goes through `normalizeNodeStyle`: wrong types, NaN and
 * out-of-range numbers are dropped, and what survives is always safe to lay out and draw.
 */

export const ICON_SIZE_LIMITS = { min: 12, max: 96 } as const;
export const CORNER_RADIUS_LIMITS = { min: 0, max: 48 } as const;

/** Quick picks in the panel; any number in `ICON_SIZE_LIMITS` is valid. */
export const ICON_SIZE_PRESETS = [
  { label: "S", size: 24 },
  { label: "M", size: 32 },
  { label: "L", size: 40 },
  { label: "XL", size: 48 },
] as const;

export const ICON_PLACEMENTS: readonly SemanticIconPlacement[] = ["left", "top", "right"];

const HEX = /^#[0-9a-f]{6}$/i;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** The valid fields of `value`, nothing else. Never throws; anything that is not an object gives `{}`. */
export const normalizeNodeStyle = (value: unknown): SemanticNodeStyle => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const out: SemanticNodeStyle = {};
  if (v.iconHidden === true) out.iconHidden = true;
  if (finite(v.iconSize)) out.iconSize = clamp(v.iconSize, ICON_SIZE_LIMITS.min, ICON_SIZE_LIMITS.max);
  if (v.iconPlacement === "left" || v.iconPlacement === "right" || v.iconPlacement === "top") out.iconPlacement = v.iconPlacement;
  if (typeof v.iconColor === "string" && HEX.test(v.iconColor)) out.iconColor = v.iconColor.toLowerCase();
  if (finite(v.cornerRadius)) out.cornerRadius = clamp(v.cornerRadius, CORNER_RADIUS_LIMITS.min, CORNER_RADIUS_LIMITS.max);
  if (v.originalIcon === null) out.originalIcon = null;
  else if (typeof v.originalIcon === "string" && v.originalIcon.length > 0 && v.originalIcon.length <= 64) out.originalIcon = v.originalIcon;
  return out;
};

/** A change to a node's style: a value sets the field, `undefined` clears it back to the default. */
export type NodeStylePatch = { [K in keyof SemanticNodeStyle]?: SemanticNodeStyle[K] | undefined };

/**
 * `current` with `patch` applied. Returns `undefined` when nothing non-default is left, so a node the
 * user reset is stored exactly like one that was never styled (no empty object left behind).
 */
export const mergeNodeStyle = (current: unknown, patch: NodeStylePatch): SemanticNodeStyle | undefined => {
  const next: Record<string, unknown> = { ...normalizeNodeStyle(current) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === false) delete next[key];
    else next[key] = value;
  }
  const clean = normalizeNodeStyle(next);
  return Object.keys(clean).length > 0 ? clean : undefined;
};
