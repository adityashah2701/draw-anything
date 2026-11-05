import { bpmnEngine } from "@/core/layout/engines/bpmn";
import { erEngine } from "@/core/layout/engines/er";
import { freeformEngine } from "@/core/layout/engines/freeform";
import { mindMapEngine } from "@/core/layout/engines/mind-map";
import { sequenceEngine } from "@/core/layout/engines/sequence";
import { umlEngine } from "@/core/layout/engines/uml";
import { registerLayoutEngine } from "@/core/layout/registry";
import { architectureEngine } from "./architecture-engine";

let registered = false;
/** Registers every engine this build ships. Idempotent; whatever needs an engine calls it first. */
export const ensureLayoutEngines = () => {
  if (registered) return;
  registered = true;
  for (const engine of [freeformEngine, architectureEngine, mindMapEngine, erEngine, umlEngine, bpmnEngine, sequenceEngine]) registerLayoutEngine(engine);
};
