import { z } from "zod";
import { unionBounds } from "@/core/geometry/box";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { ToolError } from "../errors";
import type { ToolDefinition } from "../types";
import { count, defaultOrigin } from "./helpers";

/** Most elements one generated diagram may add (a large architecture is a few hundred). */
export const MAX_GENERATED_ELEMENTS = 500;

// ── generate_diagram ─────────────────────────────────────────────────────────

const generateInput = z
  .object({
    description: z.string().trim().min(3).max(4_000).describe("What the diagram shows: the system, the parts and how they relate, in plain words."),
    diagram_type: z
      .enum(["architecture", "flowchart", "concept", "mind-map", "sequence", "network", "entity-relationship", "workflow", "class", "organization", "dependency"])
      .optional()
      .describe("The kind of diagram, when the request names one."),
  })
  .strict();

const usable = (value: unknown): value is DrawingElement => {
  if (!value || typeof value !== "object") return false;
  const item = value as { id?: unknown; type?: unknown; points?: unknown };
  return typeof item.id === "string" && item.id.length > 0 && typeof item.type === "string" && Array.isArray(item.points) && item.points.every((p) => p && typeof (p as { x: unknown }).x === "number" && typeof (p as { y: unknown }).y === "number" && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y));
};

export const generateDiagramTool: ToolDefinition<typeof generateInput> = {
  name: "generate_diagram",
  group: "generate",
  description:
    "Draw a NEW, complete, laid-out diagram from a description (a model plans, lays out and checks it). It is added beside what is already on the board and never changes existing elements. Use it for 'draw / design a diagram of ...'; use the edit tools to change what is there. One undo step.",
  input: generateInput,
  access: "write",
  needs: ["generate"],
  run: async ({ description, diagram_type }, env) => {
    const generate = env.host.generateDiagram;
    if (!generate) throw new ToolError("unavailable", "Diagram generation is not available here.");
    let outcome;
    try {
      outcome = await generate.call(env.host, { description, ...(diagram_type ? { diagramType: diagram_type } : {}) });
    } catch (error) {
      if (error instanceof ToolError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ToolError("execution_failed", `The diagram could not be generated: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}. Nothing was added.`);
    }
    const elements = outcome.elements.filter(usable).filter((el) => el.isGuide !== true);
    if (elements.length === 0) throw new ToolError("execution_failed", "The generator returned no elements, so nothing was added. Try a more specific description.");
    if (elements.length > MAX_GENERATED_ELEMENTS) throw new ToolError("limit_exceeded", `The generated diagram has ${elements.length} elements; at most ${MAX_GENERATED_ELEMENTS} can be added at once. Ask for a smaller diagram.`);

    // Beside the existing content, keeping the generated layout intact.
    const origin = defaultOrigin(env);
    const box = unionBounds(elements.flatMap((el) => env.ctx.getBounds(el) ?? []));
    const dx = origin.x - (box?.minX ?? 0);
    const dy = origin.y - (box?.minY ?? 0);
    const moved = elements.map((el) => ({ ...structuredClone(el), points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })) as DrawingElement[];
    const nodes = moved.filter((el) => el.ai?.role === "node");
    return {
      summary: `Generated a diagram: ${count(nodes.length, "node")}, ${count(moved.filter((el) => el.type === "arrow").length, "connector")} (${moved.length} elements), placed beside the existing content.`,
      data: { created: moved.map((el) => el.id), nodes: nodes.slice(0, 60).map((el) => ({ id: el.id, label: el.label })) },
      warnings: (outcome.warnings ?? []).slice(0, 8),
      patch: { add: moved, update: [], remove: [] },
      selection: nodes.length > 0 ? nodes.map((el) => el.id) : undefined,
    };
  },
};

// ── remember ─────────────────────────────────────────────────────────────────

/** Text that looks like a credential is never stored, whatever the model or the person asked. */
const SECRET = /\b(?:sk|pk|rk|ghp|gho|xox[abp]|AIza|AKIA)[-_A-Za-z0-9]{12,}|-----BEGIN [A-Z ]*KEY|\b(?:api[_ -]?key|secret|password|passwd|token|bearer)\b\s*[:=]|\b[A-Za-z0-9+/=_-]{40,}\b/i;

const rememberInput = z
  .object({
    kind: z.enum(["preference", "correction", "decision", "fact"]).describe("preference: how the person wants things done; correction: something you got wrong; decision: a design decision for this board; fact: a lasting fact about the system being drawn."),
    text: z.string().trim().min(3).max(300).describe("One short, self-contained sentence in plain words."),
  })
  .strict();

export const rememberTool: ToolDefinition<typeof rememberInput> = {
  name: "remember",
  group: "memory",
  description:
    "Save a short note to this board's shared memory so it applies in later conversations: only when the person explicitly asks you to remember something, states a lasting preference, corrects you, or settles a design decision. Never store board contents, credentials or personal data. Memory is background: the board itself and the current request always win.",
  input: rememberInput,
  access: "write",
  needs: ["memory"],
  run: async ({ kind, text }, { host }) => {
    if (!host.remember) throw new ToolError("unavailable", "Memory is not available here.");
    const clean = text.replace(/\s+/g, " ").trim();
    if (SECRET.test(clean)) throw new ToolError("invalid_arguments", "That looks like a credential or secret, so it was not saved. Memory is only for preferences and decisions.");
    const saved = await host.remember({ kind, text: clean });
    return { summary: saved.duplicate ? "Already remembered." : `Remembered (${kind}): ${clean}`, data: { kind, duplicate: saved.duplicate } };
  },
};

export const GENERATE_TOOLS = [generateDiagramTool] as const;
export const MEMORY_TOOLS = [rememberTool] as const;
