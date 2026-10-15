import { architectureFixture } from "./architecture";
import { authFlowFixture } from "./auth-flow";
import { flowchartFixture } from "./flowchart";
import { mindMapFixture } from "./mind-map";
import { stressFixture } from "./stress";

/** The graphs Sub-project B compares layout engines on. Keep them stable: results are compared across runs. */
export const LAYOUT_FIXTURES = {
  architecture: architectureFixture,
  flowchart: flowchartFixture,
  "mind-map": mindMapFixture,
  stress: stressFixture,
  "auth-flow": authFlowFixture,
} as const;
