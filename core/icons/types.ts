// Types for icon definitions and categories

export type IconCategory =
  | "compute"
  | "data"
  | "network"
  | "security"
  | "client"
  | "devops"
  | "ai"
  | "observability"
  | "hardware"
  | "business"
  | "media"
  | "devices"
  | "flow"
  | "logo"
  | "generic";

export interface IconDef {
  /** Stable id stored in boards (`ai.icon`). Never rename one; add an alias instead. */
  id: string;
  category: IconCategory;
  /** SVG path data, stroked, in a `viewBox` coordinate space. One string per shape (never joined: a relative `m` would continue the previous shape). */
  paths: string[];
  /** Width and height of the path's coordinate space; icons are fitted inside a square tile, aspect kept. */
  viewBox: { width: number; height: number };
  /** Short text shown when the icon cannot be drawn (no Path2D). */
  badge: string;
  /** Human name for pickers and labels; defaults to the id. */
  title?: string;
  /**
   * `stroke` (default): lucide-style line glyph tinted by category. `logo`: a filled glyph in its own
   * `color` on a white tile (brand marks and user-supplied artwork).
   */
  style?: "stroke" | "logo";
  /** Glyph colour for `logo` and for stroked custom icons. */
  color?: string;
  /** Stroke width in glyph units for stroked custom icons (default 2, lucide's). */
  strokeWidth?: number;
}

