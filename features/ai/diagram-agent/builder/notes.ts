import type { AgentNote } from "@/features/ai/types";
import type { BuilderNote, BuilderResult } from "./loop";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The timeline entry for one thing the agent did or found, written for the person watching. */
export const noteFor = (note: BuilderNote): AgentNote => {
  switch (note.kind) {
    case "reasoning":
      return { kind: "reasoning", title: "Thinking", text: note.text };
    case "icons":
      return { kind: "icons", title: "Looking up icons", text: note.terms ? `Searching for ${note.terms}.` : undefined };
    case "add": {
      const parts = [plural(note.nodes, "component")];
      if (note.edges > 0) parts.push(plural(note.edges, "connection"));
      // Only once there is something to read: a flow needs an arrow, a layout needs a connection.
      const text = [
        note.flow.includes("→") ? `It reads: ${note.flow}.` : "",
        note.layout && !/\b0 connections\b/.test(note.layout) ? `Layout: ${note.layout}.` : "",
        note.skipped > 0 ? `${plural(note.skipped, "more statement")} did not fit in this step and will come next.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return { kind: "add", title: `Added ${parts.join(" and ")}`, items: note.added, text: text || undefined };
    }
    case "adjust":
      return {
        kind: "adjust",
        title: note.applied.length > 0 ? "Adjusted the layout" : "Could not adjust the layout",
        items: note.applied.length > 0 ? note.applied : undefined,
        text: note.failed.length > 0 ? `Could not apply: ${note.failed.join("; ")}` : undefined,
      };
    case "undo":
      return { kind: "undo", title: "Undid an adjustment", text: note.reason, items: note.undone.length > 0 ? note.undone : undefined };
    case "review":
      return {
        kind: "review",
        title: `Review ${note.round}: ${plural(note.problems.length, "thing")} to fix`,
        items: note.problems,
        text: "Fixing these before finishing.",
      };
    case "view":
      return { kind: "view", title: "Checked the exact positions" };
  }
};

/** The closing entry: what was built, how it went, and anything left as it is. */
export const summaryNote = (result: BuilderResult): AgentNote => {
  const nodes = result.state.parsed.nodes.length;
  const edges = result.state.parsed.edges.length;
  const items = [`${plural(result.turns, "step")}${result.reviews > 0 ? `, ${plural(result.reviews, "review")}` : ""}`];
  if (result.firstReviewProblems > 0) {
    const fixed = Math.max(0, result.firstReviewProblems - result.remainingProblems.length);
    items.push(`${fixed} of ${result.firstReviewProblems} problems found at review fixed`);
  }
  if (result.stoppedByQuota) {
    return {
      kind: "stopped",
      title: `Stopped early with ${plural(nodes, "component")}`,
      text: "The AI provider's quota or rate limit was reached. What was built is on the canvas; try again in a minute, or switch provider.",
      items,
    };
  }
  return {
    kind: "summary",
    title: `${result.finished ? "Done" : "Stopped at the step limit"}: ${plural(nodes, "component")} and ${plural(edges, "connection")}`,
    items,
    text: result.remainingProblems.length > 0 ? `Left as it is: ${result.remainingProblems.slice(0, 3).join("; ")}.` : undefined,
  };
};
