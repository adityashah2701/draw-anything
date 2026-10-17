/**
 * What the pointer is doing right now. One value, so two gestures can never be "on" at once (the editor
 * used to keep five independent booleans, and a missed pointer-up could leave a drag and a draw both set).
 */
export type Gesture =
  | "idle"
  | "drawing" // creating a shape, line, connector or freehand stroke
  | "erasing"
  | "dragging" // moving the selection
  | "resizing" // a resize or arrow-end handle
  | "marquee" // rubber-band selection
  | "connecting"; // dragging a new connector out of a shape's handle

export const isDrawingGesture = (gesture: Gesture) => gesture === "drawing" || gesture === "erasing";

/** True while any gesture owns the pointer (what blocks saving a half-finished edit). */
export const isActive = (gesture: Gesture) => gesture !== "idle";
