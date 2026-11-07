/** Group frame geometry, shared by the compiler (which draws frames) and placement (which makes room). */
export const FRAME_PADDING = 20;
export const FRAME_NEST_STEP = 16;
/** Group heading: a clear label, not a poster; the frame's colour carries the emphasis. */
export const FRAME_TITLE_FONT_SIZE = 16;
export const FRAME_TITLE_FONT_WEIGHT = "700";
/** Border of a group frame. */
export const FRAME_STROKE_WIDTH = 2;
export const FRAME_CORNER_RADIUS = 16;
/** Accent per nesting level (outermost first), then repeating: warm outside, cool inside, so a nested frame reads against its parent. */
export const FRAME_ACCENTS = ["#f59e0b", "#a855f7", "#06b6d4", "#22c55e"] as const;
/** How much of the accent tints the inside of a frame: enough to group, little enough to read on paper and on graphite. */
export const FRAME_FILL_ALPHA = 0.1;

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);

/** The look of a group frame at a nesting depth: accent border, translucent tint of it, rounded corners. */
export const groupFrameStyle = (depth: number) => {
  const color = FRAME_ACCENTS[Math.max(0, depth) % FRAME_ACCENTS.length];
  return {
    color,
    fill: `rgba(${channel(color, 1)}, ${channel(color, 3)}, ${channel(color, 5)}, ${FRAME_FILL_ALPHA})`,
    strokeWidth: FRAME_STROKE_WIDTH,
    cornerRadius: FRAME_CORNER_RADIUS,
  };
};
export const FRAME_TITLE_HEIGHT = 40;
/** Space above the members for a frame of this nesting depth: one title band for its own title plus one per level of frames inside it, so an outer title never sits on an inner frame's border. */
export const frameTopBand = (depth: number) => FRAME_TITLE_HEIGHT * (depth + 1);
/** Minimum clear space between two nodes that sit next to each other. */
export const GAP_BETWEEN_NODES = 24;
