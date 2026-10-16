import { searchIcons } from "@/core/icons/registry";
import type { ToolCall } from "../types";
import { checkDiagram, type CheckReport } from "./check-diagram";

export interface ToolOutcome {
  /** What the model reads. */
  content: string;
  /** Set when the call carried a diagram that was checked. */
  report?: CheckReport;
  /** The diagram the call carried (check_diagram and finish). */
  code?: string;
  /** finish with a diagram that parses. */
  accepted?: boolean;
}

const formatIcons = (query: string): string => {
  const matches = searchIcons(query, 8);
  if (matches.length === 0) return `No icon matches "${query.slice(0, 60)}". Use a broader word (e.g. database, queue, api) or leave the icon off.`;
  return [`Icons for "${query.slice(0, 60)}" (use as icon: <id>):`, ...matches.map((m) => `- ${m.id} (${m.category}${m.via === "alias" ? ", via alias" : ""})`)].join("\n");
};

/** Runs one tool call. Total: bad input becomes a message the model can act on, never an exception. */
export const runTool = (call: ToolCall): ToolOutcome => {
  const arg = typeof call.arg === "string" ? call.arg : "";
  switch (call.name) {
    case "search_icons":
      return { content: arg.trim() ? formatIcons(arg) : "search_icons needs a word to search for." };
    case "check_diagram": {
      if (!arg.trim()) return { content: "check_diagram needs the diagram code as its argument." };
      const report = checkDiagram(arg);
      return { content: report.text, report, code: arg };
    }
    case "finish": {
      if (!arg.trim()) return { content: "finish needs the complete diagram code as its argument." };
      const report = checkDiagram(arg);
      if (!report.ok) {
        return { content: `Cannot finish yet: the diagram has problems.\n${report.text}\nFix them and call finish again.`, report, code: arg };
      }
      return { content: "Accepted.", report, code: arg, accepted: true };
    }
  }
};
