/** Group frame geometry, shared by the compiler (which draws frames) and placement (which makes room). */
export const FRAME_PADDING = 20;
export const FRAME_NEST_STEP = 16;
export const FRAME_TITLE_HEIGHT = 22;
/** Space above the members for a frame of this nesting depth: one title band for its own title plus one per level of frames inside it, so an outer title never sits on an inner frame's border. */
export const frameTopBand = (depth: number) => FRAME_TITLE_HEIGHT * (depth + 1);
/** Minimum clear space between two nodes that sit next to each other. */
export const GAP_BETWEEN_NODES = 24;
