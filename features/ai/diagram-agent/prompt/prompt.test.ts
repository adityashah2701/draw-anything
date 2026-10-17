import { describe, expect, it } from "vitest";
import { listIcons } from "@/core/icons/registry";
import { compileAIDiagramDetailed } from "@/features/ai/server/canvas-compiler";
import { documentFromParsedCode } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { EXAMPLES } from "./examples";
import { iconVocabulary } from "./icon-vocabulary";
import { PLAYBOOKS } from "./playbooks";
import { buildSystemPrompt, buildUserPrompt } from "./system";
import { runTool } from "../tools";

describe("worked examples", () => {
  it.each(EXAMPLES.map((e) => [e.request, e.code]))("%s parses without errors or warnings", (_name, code) => {
    const parsed = parseDiagramCode(code);
    expect(parsed.issues).toEqual([]);
    expect(parsed.nodes.length).toBeGreaterThan(3);
  });

  it.each(EXAMPLES.map((e) => [e.request, e.code]))("%s lays out cleanly (what we teach must not be what we reject)", (_name, code) => {
    const { document } = documentFromParsedCode(parseDiagramCode(code), "g");
    const { diagnostics, elements } = compileAIDiagramDetailed(document, "f");
    expect(diagnostics.collidingLabels).toEqual([]);
    expect(diagnostics.droppedGroups).toEqual([]);
    expect(diagnostics.unfittedNodes).toEqual([]);
    expect(diagnostics.layoutFallback).toBeUndefined();
    expect(elements.length).toBeGreaterThan(5);
  });

  it("every icon an example names resolves to a registry icon", () => {
    const ids = new Set(listIcons().map((i) => i.id));
    for (const e of EXAMPLES) {
      for (const n of parseDiagramCode(e.code).nodes) {
        if (n.icon) expect(ids.has(document_icon(n.icon)), `${e.request}: ${n.icon}`).toBe(true);
      }
    }
  });
});

import { resolveIconId } from "@/core/icons/registry";
const document_icon = (ref: string) => resolveIconId(ref) ?? "MISSING";

describe("prompts", () => {
  it("icon vocabulary lists registry ids only, grouped by category", () => {
    const ids = new Set(listIcons().map((i) => i.id));
    for (const line of iconVocabulary().split("\n")) {
      const [category, rest] = line.split(": ");
      expect(category).toMatch(/^[a-z]+$/);
      for (const id of rest.split(", ")) expect(ids.has(id), id).toBe(true);
    }
  });

  it("system prompt carries the language, playbooks and examples; text syntax only for the text transport", () => {
    const text = buildSystemPrompt("text");
    const native = buildSystemPrompt("native");
    for (const p of [text, native]) {
      expect(p).toContain("Group Name { ... }");
      for (const type of Object.keys(PLAYBOOKS)) expect(p).toContain(`- ${type}:`);
      expect(p).toContain("CI/CD pipeline");
      expect(p).not.toMatch(/EXACTLY|exactly \d+ nodes/i);
    }
    expect(text).toContain('<tool name="finish">');
    expect(native).not.toContain("<tool name=");
  });

  it("the user prompt includes an existing diagram only when there is one", () => {
    expect(buildUserPrompt("add a cache")).toBe("Request: add a cache");
    expect(buildUserPrompt("add a cache", "A > B")).toContain("A > B");
  });

  it("system prompt stays a sensible size", () => {
    expect(buildSystemPrompt("text").length).toBeLessThan(12_000);
  });
});

describe("icon-only nodes in the prompt and tools", () => {
  it.each(["native", "text"] as const)("%s: the prompt teaches shape: icon", (transport) => {
    expect(buildSystemPrompt(transport)).toContain("shape: icon");
  });

  it("search_icons tells the model how to draw a result as a bare icon", () => {
    expect(runTool({ name: "search_icons", arg: "database" }).content).toContain("shape: icon");
  });
});
