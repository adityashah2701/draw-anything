import { z } from "zod";
import { ToolError } from "../errors";
import type { ToolDefinition } from "../types";

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

export const MEMORY_TOOLS = [rememberTool] as const;
