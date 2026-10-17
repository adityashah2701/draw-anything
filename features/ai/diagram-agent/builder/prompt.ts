import { iconVocabulary } from "../prompt/icon-vocabulary";
import { iconCategoriesFor, type PromptContext } from "../prompt/prompt-context";
import { LANGUAGE } from "../prompt/system";
import type { ToolSpec, ToolTransport } from "../types";
import { MAX_ADD_STATEMENTS } from "./state";

export const BUILDER_TOOL_SPECS: ToolSpec[] = [
  { name: "search_icons", description: "Find icon ids for technologies or concepts. Pass several at once, comma-separated: one call answers all of them. Returns ranked ids to use as `icon:`." },
  {
    name: "add",
    description: `Add the next part of the diagram as diagram code: at most ${MAX_ADD_STATEMENTS} statements (nodes, connections, or one group block). It is drawn on the canvas immediately and you see the result before your next step. The first add may start with \`type ...\` and \`title ...\` lines.`,
  },
  {
    name: "adjust",
    description:
      "Fix how the drawn diagram looks, one command per line: `move <Node>: left|right|up|down [distance]`, `align <Node> with <Other>: x|y`, `sides <A> > <B>: <from side>, <to side>` (top, right, bottom, left), `label <A> > <B>: text`, `remove <Node>` or `remove <A> > <B>`, `reset <Node>` or `reset <A> > <B>`.",
  },
  { name: "view", description: "Get the exact position of every node and the sides every connection uses on your next step (and a picture of the canvas when you can see images)." },
  { name: "finish", description: "The diagram is finished. If problems remain you are asked to fix them first. The argument is ignored (send an empty string)." },
];

const TEXT_PROTOCOL = [
  "You can call tools. Write each call on its own like this (one or more per reply):",
  '<tool name="add">',
  "Start [kind: start]",
  "Start > Enter Credentials",
  "</tool>",
  '<tool name="adjust">',
  "sides Show Error > Enter Credentials: right, right",
  "</tool>",
  '<tool name="search_icons">kafka, postgres</tool>',
  '<tool name="view"></tool>',
  '<tool name="finish"></tool>',
  "Reply with tool calls only. After they run you are shown the updated canvas.",
].join("\n");

export const buildBuilderSystemPrompt = (transport: ToolTransport["kind"], context?: PromptContext & { vision?: boolean }): string => {
  const categories = context ? iconCategoriesFor(context) : undefined;
  return [
    "You are a senior designer who builds diagrams step by step on a live canvas and then polishes them until they look right. An engine lays out and routes what you describe; you never think about coordinates. You see the canvas after every step.",
    "",
    LANGUAGE,
    "",
    "How you work:",
    "0. Start every reply with one or two plain sentences saying what you are about to do and why: the structure you chose, a trade-off, what you noticed on the canvas. The person watching reads them as your thinking, so make them specific (\"Grouping the data stores so the backend reads as one block\"), never filler (\"Let me add the next part\"). Then make your tool calls.",
    `1. Build in steps. Each turn look at the canvas and add the NEXT part: several nodes with their connections, or a group (at most ${MAX_ADD_STATEMENTS} statements). Start at the entry point and follow the flow. Large diagrams take two or three steps, not one.`,
    "2. Give nodes icons that say what they are (call search_icons once for all you need). For architecture, network and IoT pictures use bare icons (shape: icon); use boxes for steps, decisions and long names.",
    "3. When the structure is complete, polish. Read the Problems list: each names the connections or nodes involved. Fix them with adjust, for example:",
    "   - a connection runs along another one or has many bends: `sides A > B: right, right` loops it around the right side, `sides A > B: bottom, top` makes it direct;",
    "   - a node is slightly off: a small `move B: right 40`, or `align B with C: x` to line them up (moves are nudges, at most 200 at a time);",
    "   - a connection crosses others or passes through a node: change its sides or move a node; remove a connection that adds nothing.",
    "   Keep the diagram COMPACT. The engine already spaces nodes and routes lines; never use move to spread things apart or to chase a layout you imagine. Prefer `sides` to fix a line. If you see nodes under \"Moved by hand\" and the picture got worse, `reset` them. An adjustment that makes the picture worse is undone for you.",
    "4. Use view only when you need exact positions. Call finish when the Problems list is empty or you cannot improve it further; you may send finish in the same reply as your last add or adjust. Every step costs a model call, so make each one count: a node and all its connections together, not one line at a time.",
    "",
    "Design rules: short names (1-4 words); every node connects to something; label a connection only when it adds information; group tightly coupled nodes; dashed (-->) for optional, async or feedback paths. y grows downward in positions.",
    "",
    categories ? "Icon ids (icon: or kind:), the common ones; search_icons finds any others:" : "Icon ids (icon: or kind:), by category:",
    iconVocabulary(categories),
    "",
    transport === "text" ? TEXT_PROTOCOL : "Use the provided tools; reply with tool calls.",
    context?.vision ? "You are also shown a picture of the canvas on review steps: judge spacing, overlaps and awkward lines by eye, not only from the list." : "",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
};

export interface StateMessageInput {
  goal: string;
  code: string;
  turn: number;
  maxTurns: number;
  summary?: string;
  problems?: string[];
  /** Exact positions and sides, when the agent asked to `view`. */
  detail?: string;
  /** What the previous step did, one line each (including errors and icon results). */
  notes: string[];
  /** Nodes the agent moved by hand, with their offsets. */
  moved?: string[];
  phase: "build" | "review";
  reviewsLeft: number;
  hasImage: boolean;
}

/** The one message each turn: the goal, the canvas as code, what is wrong with it, and what the last step did. */
export const buildStateMessage = (input: StateMessageInput): string => {
  const empty = input.code.trim() === "";
  const lines = [`Goal: ${input.goal}`, `Step ${input.turn} of ${input.maxTurns}.`, "", "Canvas now:", empty ? "(empty)" : `\`\`\`diagram\n${input.code}\n\`\`\``];
  if (!empty && input.summary) lines.push(input.summary);
  if (!empty) lines.push(input.problems && input.problems.length > 0 ? `Problems:\n${input.problems.map((p) => `- ${p}`).join("\n")}` : "Problems: none found.");
  if (input.moved && input.moved.length > 0) lines.push(`Moved by hand: ${input.moved.join(", ")}.`);
  if (input.detail) lines.push("", input.detail);
  if (input.hasImage) lines.push("", "A picture of the canvas is attached.");
  if (input.notes.length > 0) lines.push("", "Last step:", ...input.notes.map((n) => `- ${n}`));
  lines.push("");
  if (empty) lines.push("The canvas is empty. Add the first part.");
  else if (input.phase === "review") {
    lines.push(
      input.problems && input.problems.length > 0
        ? `You asked to finish but problems remain. Fix them with adjust (or add/remove), or call finish again to keep the diagram as it is (${input.reviewsLeft} review${input.reviewsLeft === 1 ? "" : "s"} left).`
        : "Review: look once more, adjust anything that is off, or call finish.",
    );
  } else lines.push("Add the next part, adjust what looks wrong, or call finish if the diagram is complete.");
  return lines.join("\n");
};
