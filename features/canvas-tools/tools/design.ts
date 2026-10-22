import { z } from "zod";
import { MAX_REVIEWS, reviewLayout } from "../review";
import { NODE_KINDS, planLayout } from "../plan";
import type { ToolDefinition } from "../types";
import { count, defaultOrigin } from "./helpers";

// ── plan_layout ──────────────────────────────────────────────────────────────

const planInput = z
  .object({
    nodes: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            kind: z.enum(NODE_KINDS).optional().describe("process (default), decision (diamond), terminal (start/end pill), icon, note."),
          })
          .strict(),
      )
      .min(1)
      .max(80)
      .describe("In drawing order along the flow."),
    direction: z.enum(["down", "right"]).optional().describe("Flow direction; default down."),
    lanes: z.number().int().min(1).max(8).optional().describe("Nodes per rank; default: chosen to fit the view."),
  })
  .strict();

export const planLayoutTool: ToolDefinition<typeof planInput> = {
  name: "plan_layout",
  group: "inspect",
  description:
    "Plan a diagram before drawing it: text-fitting sizes per role, shared gaps, an x, y, width, height for every node, and whether it fits and stays readable in the current view. Changes nothing.",
  input: planInput,
  access: "read",
  run: ({ nodes, direction, lanes }, env) => {
    const plan = planLayout({ nodes, direction, lanes }, defaultOrigin(env), env.host.getViewport());
    return {
      summary: `Planned ${count(nodes.length, "node")} in ${plan.ranks} ranks of up to ${plan.lanes}: ${plan.bounds.width} x ${plan.bounds.height} units, ${plan.view.readable ? "readable" : "too small to read"} at ${Math.round(plan.view.fitZoom * 100)}% zoom.`,
      data: { ...plan },
      warnings: plan.view.readable ? undefined : plan.notes,
    };
  },
};

// ── review_layout ────────────────────────────────────────────────────────────

const reviewInput = z.object({}).strict();

export const reviewLayoutTool: ToolDefinition<typeof reviewInput> = {
  name: "review_layout",
  group: "inspect",
  description:
    `Measure the board and list layout problems (clipped labels, overlaps, crossing connectors, uneven sizes, content out of view, unreadable text) with ids and a fix each. Geometry only, no pixels. At most ${MAX_REVIEWS} reviews per request. Changes nothing.`,
  input: reviewInput,
  access: "read",
  run: (_input, env) => {
    const review = reviewLayout(env.ctx, env.host.getViewport());
    const attempt = (env.session.reviews = (env.session.reviews ?? 0) + 1);
    const last = attempt >= MAX_REVIEWS;
    const open = review.findings.filter((finding) => finding.severity !== "info");
    const next =
      review.verdict === "good"
        ? "Meets the quality checks. Stop and report."
        : last
          ? "Review limit reached. Do not refine further: tell the person what is left."
          : `Fix the named findings with targeted edits (not a rebuild), then review_layout again (${MAX_REVIEWS - attempt} left).`;
    return {
      summary: review.verdict === "good" ? `Layout review ${attempt}/${MAX_REVIEWS}: no problems found.` : `Layout review ${attempt}/${MAX_REVIEWS}: ${count(open.length, "problem")} to fix.`,
      data: { ...review, attempt, maxAttempts: MAX_REVIEWS, next },
    };
  },
};

export const DESIGN_TOOLS = [planLayoutTool, reviewLayoutTool] as const;
