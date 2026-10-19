import { isDarkSurface, readableOnDark } from "@/core/color/adaptive-color";
import { categoryTint, type IconDef } from "@/core/icons/registry";

/**
 * The colour a node's line icon is drawn in: the user's choice, else the icon's own tint, and in either
 * case lightened only as far as needed when the glyph sits on a dark surface (a dark fill, or the dark
 * canvas when the node has no fill). Brand marks keep their own colours on their white tile.
 */
export const resolveIconTint = ({ icon, override, fill, dark }: { icon: IconDef; override?: string; fill?: string; dark: boolean }): string | undefined => {
  if (icon.style === "logo") return undefined;
  const base = override ?? icon.color ?? categoryTint(icon.category);
  // A fill we can read decides; none (or "transparent", or a colour function) leaves the canvas behind the glyph.
  const onDark = fill && /^#[0-9a-f]{6}$/i.test(fill) ? isDarkSurface(fill) : dark;
  return onDark ? readableOnDark(base) : base;
};
