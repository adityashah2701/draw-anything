import { parseDiagramCode } from "@/features/diagram-code/parse";
import { z } from "zod";
import { graphFromElements } from "@/features/diagram-code/canvas";
import { serializeDiagramCode, type SerializableGraph } from "@/features/diagram-code/serialize";
import type { DrawingElement } from "@/features/whiteboard/types/whiteboard.types";
import { reportBoard } from "../agent/report";
import { ToolError } from "../errors";
import type { ToolDefinition, ToolEnv } from "../types";
import { applyDiagramCodeTool } from "./code";
import { importDiagramTool } from "./create";

/**
 * The builder: the agent draws and changes a diagram in steps, as diagram code, on the live board. Every step is
 * one visible tool call and one undo step; the engine lays out and routes, the agent never gives coordinates.
 * The code tools (import_diagram, apply_diagram_code) do the writing; these tools add the plan, the step size, the
 * scope (which diagram is being built) and the finish gate.
 */

/** Top-level statements one add may hold; tables, classes, lifelines and topics are written whole in one step. */
export const MAX_STEP_STATEMENTS = 60;
export const MAX_STRUCTURED_STATEMENTS = 80;
const STRUCTURED_TYPE = /^\s*type\s+(entity-relationship|class|sequence|mind-map)\b/im;
const HEADER = /^\s*(type|title|direction)\b/i;

/** Top-level statements in a piece of code: a block (`frame X { ... }`) counts once; headers and comments do not count. */
export const countStatements = (code: string): number => {
  let depth = 0;
  let count = 0;
  for (const raw of code.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || (depth === 0 && HEADER.test(line))) continue;
    if (depth === 0) count += 1;
    depth = Math.max(0, depth + (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0));
  }
  return count;
};

/**
 * Models often write a block on one line (`frame Edge { CDN [icon: cdn], Load Balancer }`), which the language does
 * not read. Such lines are split into `frame Edge {`, one statement per line, `}`; quotes and brackets are respected.
 */
export const expandInlineBlocks = (code: string): string =>
  code
    .split("\n")
    .flatMap((raw) => {
      const line = raw.trim();
      if (!/[{}]/.test(line) || /^[^{}]*\{$/.test(line)) return [raw];
      const out: string[] = [];
      let current = "";
      let quote = false;
      let bracket = 0;
      let open = 0;
      const push = () => {
        if (current.trim()) out.push(current.trim());
        current = "";
      };
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === "\\" && quote) { current += ch + (line[i + 1] ?? ""); i += 1; continue; }
        if (ch === '"') quote = !quote;
        else if (!quote && ch === "[") bracket += 1;
        else if (!quote && ch === "]") bracket = Math.max(0, bracket - 1);
        else if (!quote && bracket === 0 && ch === "{") { out.push(`${current.trim()} {`); current = ""; open += 1; continue; }
        else if (!quote && bracket === 0 && ch === "}") { push(); out.push("}"); open = Math.max(0, open - 1); continue; }
        else if (!quote && bracket === 0 && open > 0 && (ch === "," || ch === ";")) { push(); continue; }
        current += ch;
      }
      push();
      return out;
    })
    .join("\n");

const EDGE_PART = /[<>]|\s-{1,2}\s|--|:/;
/**
 * A node declared without a shape becomes a captioned icon when it has an icon or kind, else a plain box, never the
 * boxed icon tile (semantic node). Decisions and start/end keep their diamond and pill; connection lines are untouched.
 */
export const withDefaultShapes = (code: string): string =>
  code
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith("//") || HEADER.test(line) || line.endsWith("{") || line === "}") return raw;
      const open = line.indexOf("[");
      const name = open === -1 ? line : line.slice(0, open);
      if (EDGE_PART.test(name.replace(/"[^"]*"/g, '""')) || (open !== -1 && !line.endsWith("]"))) return raw;
      if (open === -1) return `${raw} [shape: rectangle]`;
      const props = line.slice(open + 1, -1);
      if (/\bshape\s*:/.test(props) || /\bkind\s*:\s*(decision|start|end)\b/.test(props)) return raw;
      const shape = /\b(icon|kind)\s*:/.test(props) ? "icon" : "rectangle";
      return raw.replace("[", `[shape: ${shape}, `);
    })
    .join("\n");

const isDiagramShape = (el: DrawingElement) => el.ai?.role === "node" || el.type === "arrow" || el.type === "arrow-bidirectional" || el.type === "frame" || el.ai?.role === "edge-label";

/**
 * The elements of the diagram the builder works on. A new diagram is what this run created; an edit is the
 * selection the person made before asking (plus what this run changed), else the whole board.
 */
export const builderScope = (env: ToolEnv): DrawingElement[] => {
  const b = env.session.builder ?? {};
  const shapes = env.ctx.shapes as DrawingElement[];
  if (b.mode === "new" && b.created) return shapes.filter((el) => env.session.touched.has(el.id));
  const start = b.startSelection ?? [];
  if (start.length > 0) {
    const picked = new Set([...start, ...env.session.touched]);
    // A selected frame brings its contents.
    for (const el of shapes) if (el.frameId && picked.has(el.frameId)) picked.add(el.id);
    return shapes.filter((el) => picked.has(el.id));
  }
  return shapes.filter(isDiagramShape);
};

const remember = (env: ToolEnv) => {
  env.session.builder ??= {};
  env.session.builder.startSelection ??= [...env.host.getSelection()];
  return env.session.builder;
};

// ── set_plan ─────────────────────────────────────────────────────────────────

const planInput = z
  .object({
    plan: z.string().trim().min(10).max(3000).describe("The diagram type and reading direction; each frame with the nodes it holds; groups; externals; then the build steps in order (one line each). Revise it when the request or the board changes."),
    new_diagram: z.boolean().describe("true: draw a new diagram beside what is on the board. false: change the diagram that is already there."),
  })
  .strict();

export const setPlanTool: ToolDefinition<typeof planInput> = {
  name: "set_plan",
  group: "generate",
  description: "Write or revise the plan for this request before drawing: type, direction, frames and their nodes, groups, steps. It is shown back to you every turn, so you never lose track. Changes nothing on the board.",
  input: planInput,
  access: "read",
  boardIndependent: true,
  run: ({ plan, new_diagram }, env) => {
    const b = remember(env);
    b.plan = plan;
    // A plan cannot turn a diagram that is being built back into an edit, or start a second new one.
    if (!b.created) b.mode = new_diagram ? "new" : "edit";
    return { summary: `Plan ${b.created ? "revised" : "set"} (${b.mode === "new" ? "new diagram" : "edit the diagram on the board"}).`, data: { mode: b.mode } };
  },
};

// ── add_to_diagram ───────────────────────────────────────────────────────────

const addInput = z
  .object({
    code: z.string().trim().min(1).max(20_000).describe("The next part of the diagram as diagram code: nodes, connections, frames or groups. The first step of a new diagram starts with `type`, `direction` and `title` lines. Name existing nodes exactly as the board code writes them."),
  })
  .strict();

export const addToDiagramTool: ToolDefinition<typeof addInput> = {
  name: "add_to_diagram",
  group: "generate",
  description: `Draw the next part of the diagram from diagram code: at most ${MAX_STEP_STATEMENTS} statements per step (${MAX_STRUCTURED_STATEMENTS} for ER, class, sequence and mind-map diagrams; a frame or group block counts once). The engine places and routes everything; existing nodes keep their places. Atomic: code with an error changes nothing and the error names the line.`,
  input: addInput,
  access: "write",
  run: async ({ code: written }, env) => {
    const expanded = expandInlineBlocks(written);
    const code = STRUCTURED_TYPE.test(expanded) ? expanded : withDefaultShapes(expanded);
    // Check the step on its own first, so errors point at the model's own lines rather than the merged code.
    const lines = code.split("\n");
    const errors = parseDiagramCode(code).issues.filter((i) => i.severity === "error");
    if (errors.length > 0) throw new ToolError("invalid_arguments", `This step has ${errors.length} error(s), nothing was drawn: ${errors.slice(0, 5).map((e) => `line ${e.line} \`${(lines[e.line - 1] ?? "").trim().slice(0, 80)}\`: ${e.message}`).join("; ")}. Write one statement per line; a block is \`frame Name {\`, its nodes on their own lines, then \`}\`.`);
    const b = remember(env);
    const existing = builderScope(env);
    const structured = STRUCTURED_TYPE.test(code) || STRUCTURED_TYPE.test(b.plan ?? "");
    const limit = structured ? MAX_STRUCTURED_STATEMENTS : MAX_STEP_STATEMENTS;
    const statements = countStatements(code);
    if (statements > limit) throw new ToolError("limit_exceeded", `This step has ${statements} statements; send at most ${limit} and the rest in the next step.`);

    const startNew = b.mode === "new" ? !b.created : !existing.some((el) => el.ai?.role === "node");
    if (startNew) {
      const result = await importDiagramTool.run({ code }, env);
      b.mode = "new";
      b.created = true;
      return { ...result, summary: `Step drawn: ${result.summary}` };
    }
    const { graph } = graphFromElements(existing);
    if (graph.nodes.length === 0) throw new ToolError("invalid_state", "There is no diagram to extend here. Set the plan with new_diagram true to draw a new one.");
    // The board's own code first, then the new statements: names match, so what is there stays where it is.
    const merged = `${serializeDiagramCode(graph)}\n${code.split("\n").filter((line) => !HEADER.test(line)).join("\n")}`;
    const result = await applyDiagramCodeTool.run({ code: merged, ids: existing.map((el) => el.id) }, env);
    return { ...result, summary: `Step drawn: ${result.summary}` };
  },
};

// ── adjust_diagram ───────────────────────────────────────────────────────────

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];
const MAX_MOVE = 400;

const adjustInput = z
  .object({
    commands: z.string().trim().min(3).max(4000).describe("One command per line, nodes by name: `move A: right 80` (or `move A: 40, -20`), `align A with B: x|y`, `swap A with B`, `sides A > B: right, left`, `label A > B: text` (empty removes), `rename A: New name`, `remove A`, `remove A > B`."),
  })
  .strict();

/** Applies builder commands to the diagram code with its layout; returns what changed and what could not be done. */
export const adjustGraph = (graph: SerializableGraph, commands: string): { applied: string[]; failed: string[] } => {
  const applied: string[] = [];
  const failed: string[] = [];
  const find = (name: string) => {
    const key = name.trim().toLowerCase();
    return graph.nodes.find((n) => n.label.toLowerCase() === key || n.id.toLowerCase() === key);
  };
  const pair = (text: string) => {
    const [a, b] = text.split(">").map((s) => s.trim());
    const from = a ? find(a) : undefined;
    const to = b ? find(b) : undefined;
    return from && to ? { from, to, edges: graph.edges.filter((e) => e.from === from.id && e.to === to.id) } : undefined;
  };
  for (const raw of commands.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(move|align|swap|sides|label|rename|remove)\s+(.+)$/i);
    if (!m) {
      failed.push(`"${line}": unknown command`);
      continue;
    }
    const [, verb, rest] = [m[0], m[1].toLowerCase(), m[2]];
    const fail = (why: string) => failed.push(`"${line}": ${why}`);
    if (verb === "move") {
      const mm = rest.match(/^(.+?):\s*(?:(left|right|up|down)\s*(\d+)?|(-?\d+)\s*,\s*(-?\d+))$/i);
      const node = mm ? find(mm[1]) : undefined;
      if (!mm || !node || node.x === undefined || node.y === undefined) { fail("expected `move A: right 80` with a node on the board"); continue; }
      const d = Math.min(MAX_MOVE, Number(mm[3] ?? 80));
      const dx = mm[2] ? (mm[2] === "left" ? -d : mm[2] === "right" ? d : 0) : Math.max(-MAX_MOVE, Math.min(MAX_MOVE, Number(mm[4])));
      const dy = mm[2] ? (mm[2] === "up" ? -d : mm[2] === "down" ? d : 0) : Math.max(-MAX_MOVE, Math.min(MAX_MOVE, Number(mm[5])));
      node.x += dx;
      node.y += dy;
      applied.push(`moved ${node.label}`);
    } else if (verb === "align" || verb === "swap") {
      const mm = rest.match(/^(.+?)\s+with\s+(.+?)(?::\s*(x|y))?$/i);
      const a = mm ? find(mm[1]) : undefined;
      const b = mm ? find(mm[2]) : undefined;
      if (!a || !b || a.x === undefined || a.y === undefined || b.x === undefined || b.y === undefined) { fail(`expected \`${verb} A with B${verb === "align" ? ": x" : ""}\``); continue; }
      if (verb === "swap") {
        [a.x, b.x, a.y, b.y] = [b.x, a.x, b.y, a.y];
        applied.push(`swapped ${a.label} and ${b.label}`);
      } else if ((mm![3] ?? "x").toLowerCase() === "x") {
        a.x = b.x + ((b.width ?? 0) - (a.width ?? 0)) / 2;
        applied.push(`aligned ${a.label} under ${b.label}`);
      } else {
        a.y = b.y + ((b.height ?? 0) - (a.height ?? 0)) / 2;
        applied.push(`aligned ${a.label} level with ${b.label}`);
      }
    } else if (verb === "sides") {
      const mm = rest.match(/^(.+?):\s*(\w+)\s*,\s*(\w+)$/);
      const p = mm ? pair(mm[1]) : undefined;
      const from = mm?.[2].toLowerCase() as Side;
      const to = mm?.[3].toLowerCase() as Side;
      if (!p || p.edges.length === 0 || !SIDES.includes(from) || !SIDES.includes(to)) { fail("expected `sides A > B: right, left` for an existing connection"); continue; }
      for (const e of p.edges) Object.assign(e, { fromSide: from, toSide: to });
      applied.push(`${p.from.label} > ${p.to.label} leaves ${from}, enters ${to}`);
    } else if (verb === "label") {
      const mm = rest.match(/^(.+?):\s*(.*)$/);
      const p = mm ? pair(mm[1]) : undefined;
      if (!p || p.edges.length === 0) { fail("expected `label A > B: text` for an existing connection"); continue; }
      for (const e of p.edges) e.label = mm![2].trim() || undefined;
      applied.push(`labelled ${p.from.label} > ${p.to.label}`);
    } else if (verb === "rename") {
      const mm = rest.match(/^(.+?):\s*(.+)$/);
      const node = mm ? find(mm[1]) : undefined;
      if (!node) { fail("expected `rename A: New name`"); continue; }
      const before = node.label;
      node.label = mm![2].trim();
      applied.push(`renamed ${before} to ${node.label}`);
    } else {
      const p = rest.includes(">") ? pair(rest) : undefined;
      if (p) {
        graph.edges = graph.edges.filter((e) => !p.edges.includes(e));
        applied.push(`removed ${p.from.label} > ${p.to.label}`);
        continue;
      }
      const node = find(rest);
      if (!node) { fail("no node or connection by that name"); continue; }
      graph.nodes = graph.nodes.filter((n) => n !== node);
      graph.edges = graph.edges.filter((e) => e.from !== node.id && e.to !== node.id);
      graph.groups = graph.groups.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => id !== node.id) }));
      graph.frames = graph.frames?.map((f) => ({ ...f, nodeIds: f.nodeIds.filter((id) => id !== node.id) }));
      applied.push(`removed ${node.label}`);
    }
  }
  return { applied, failed };
};

export const adjustDiagramTool: ToolDefinition<typeof adjustInput> = {
  name: "adjust_diagram",
  group: "generate",
  description: "Fix how the diagram looks or reads, by node names, one command per line: move, align, swap, sides, label, rename, remove. Only what you name changes; everything else keeps its place. One undo step.",
  input: adjustInput,
  access: "write",
  run: async ({ commands }, env) => {
    remember(env);
    const scope = builderScope(env);
    const { graph } = graphFromElements(scope, { layout: true });
    if (graph.nodes.length === 0) throw new ToolError("invalid_state", "There is no diagram on the board to adjust.");
    const { applied, failed } = adjustGraph(graph, commands);
    if (applied.length === 0) throw new ToolError("invalid_arguments", `Nothing changed: ${failed.slice(0, 5).join("; ")}`);
    const result = await applyDiagramCodeTool.run({ code: serializeDiagramCode(graph), ids: scope.map((el) => el.id), with_layout: true, confirm: true }, env);
    return { ...result, summary: `Adjusted: ${applied.join("; ")}.`, warnings: [...(result.warnings ?? []), ...failed] };
  },
};

// ── finish ───────────────────────────────────────────────────────────────────

const finishInput = z.object({ summary: z.string().trim().max(600).optional().describe("One or two sentences for the person: what the diagram shows or what changed.") }).strict();

export const finishTool: ToolDefinition<typeof finishInput> = {
  name: "finish",
  group: "generate",
  description: "Say the diagram is done. Refused while the board has faults (overlapping nodes, connectors through nodes, broken rules of the diagram type); asking again with nothing changed is accepted. Advice such as crossings never blocks.",
  input: finishInput,
  access: "read",
  run: ({ summary }, env) => {
    const b = remember(env);
    const report = reportBoard(builderScope(env));
    if (report.blocking.length > 0 && b.refusedAt !== env.revision) {
      b.refusedAt = env.revision;
      return { summary: `Not finished: ${report.blocking.length} fault(s) to fix first.`, data: { accepted: false, faults: report.blocking } };
    }
    b.finished = true;
    return { summary: summary ? `Finished: ${summary}` : "Finished.", data: { accepted: true, ...(report.blocking.length > 0 ? { left: report.blocking } : {}) } };
  },
};

export const BUILDER_TOOLS = [setPlanTool, addToDiagramTool, adjustDiagramTool, finishTool] as const;
