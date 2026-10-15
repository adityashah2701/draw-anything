import { architectureFixture } from "./architecture";
import { flowchartFixture } from "./flowchart";
import { mindMapFixture } from "./mind-map";

/** The graphs Sub-project B compares layout engines on. Keep them stable: results are compared across runs. */
export const LAYOUT_FIXTURES = {
  architecture: architectureFixture,
  flowchart: flowchartFixture,
  "mind-map": mindMapFixture,
} as const;
