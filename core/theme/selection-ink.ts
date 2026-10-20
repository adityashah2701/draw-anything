import { isDarkRender } from "@/core/theme/render-theme";

// The design system's ink (primary) in the form a canvas needs: sRGB, one per page theme.
// Keep in step with `--primary` in app/globals.css.
const LIGHT: [number, number, number] = [0x1d, 0x54, 0xc1];
const DARK: [number, number, number] = [0x7d, 0xaa, 0xfd];

/** The colour of selection outlines, handles and edit affordances on the canvas, for the current render theme. */
export const selectionInk = (alpha = 1): string => {
  const [r, g, b] = isDarkRender() ? DARK : LIGHT;
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
