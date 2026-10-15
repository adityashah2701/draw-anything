/** The two members the wrapping code uses, so layout runs on a canvas context or a test double. */
export type MeasureContext = Pick<CanvasRenderingContext2D, "font" | "measureText">;
