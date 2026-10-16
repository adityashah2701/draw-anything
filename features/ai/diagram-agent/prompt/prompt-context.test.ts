import { describe, expect, it } from "vitest";
import { listIcons } from "@/core/icons/registry";
import type { AIDiagramType } from "@/features/ai/types";
import { EXAMPLES, examplesFor } from "./examples";
import { iconVocabulary } from "./icon-vocabulary";
import { PLAYBOOKS } from "./playbooks";
import { iconCategoriesFor, inferDiagramType } from "./prompt-context";
import { buildSystemPrompt } from "./system";

/** Estimated tokens: characters / 4. An estimate of any tokenizer, not a count. */
const tokens = (text: string) => Math.ceil(text.length / 4);
const TYPES = Object.keys(PLAYBOOKS) as AIDiagramType[];

// Budgets are set from the measured sizes (see docs/superpowers/notes/2026-10-16-handoff-ai-shapes-colors.md)
// with about 10% headroom, so growing a prompt on purpose is a visible decision.
const BUDGET = { complete: 2_100, typeUnknown: 1_650, typeKnown: 1_200 };

describe("system prompt budget", () => {
  it.each(["native", "text"] as const)("%s: the complete prompt (no context) stays within its budget", (transport) => {
    expect(tokens(buildSystemPrompt(transport))).toBeLessThanOrEqual(BUDGET.complete);
  });

  it.each(["native", "text"] as const)("%s: a request of unknown type stays within its budget", (transport) => {
    expect(tokens(buildSystemPrompt(transport, { prompt: "draw me something" }))).toBeLessThanOrEqual(BUDGET.typeUnknown);
  });

  it.each(TYPES)("%s: a known type stays within its budget and is much smaller than the complete prompt", (diagramType) => {
    const text = buildSystemPrompt("text", { diagramType, prompt: "x" });
    expect(tokens(text)).toBeLessThanOrEqual(BUDGET.typeKnown);
    expect(tokens(text)).toBeLessThan(tokens(buildSystemPrompt("text")) * 0.65);
  });
});

describe("what every trimmed prompt must still say", () => {
  const contexts: Array<[string, Parameters<typeof buildSystemPrompt>[1]]> = [
    ["no context", undefined],
    ["unknown type", { prompt: "x" }],
    ...TYPES.map((t): [string, Parameters<typeof buildSystemPrompt>[1]] => [t, { diagramType: t, prompt: "x" }]),
  ];

  it.each(contexts)("%s: language, process, tools, and a worked example are present", (_name, context) => {
    for (const transport of ["native", "text"] as const) {
      const p = buildSystemPrompt(transport, context);
      expect(p).toContain("Group Name { ... }");
      expect(p).toContain("A > B");
      expect(p).toContain("kind");
      expect(p).toContain("search_icons");
      expect(p).toContain("check_diagram");
      expect(p).toContain("finish");
      expect(p).toMatch(/```diagram\n/);
      expect(p).toContain("Design rules:");
    }
    expect(buildSystemPrompt("text", context)).toContain('<tool name="finish">');
    expect(buildSystemPrompt("native", context)).not.toContain("<tool name=");
  });

  it.each(TYPES)("%s: carries its own playbook and not the others'", (diagramType) => {
    const p = buildSystemPrompt("native", { diagramType, prompt: "x" });
    expect(p).toContain(`- ${diagramType}: ${PLAYBOOKS[diagramType]}`);
    for (const other of TYPES.filter((t) => t !== diagramType)) expect(p).not.toContain(`- ${other}: `);
  });

  it("an unknown type keeps every playbook so the model can still choose", () => {
    const p = buildSystemPrompt("native", { prompt: "x" });
    for (const type of TYPES) expect(p).toContain(`- ${type}:`);
  });

  it("a flowchart prompt lists the flow icons, including the start and end terminators", () => {
    const p = buildSystemPrompt("native", { diagramType: "flowchart", prompt: "x" });
    const flow = p.split("\n").find((l) => l.startsWith("flow: "))!;
    expect(flow).toMatch(/\bstart\b/);
    expect(flow).toMatch(/\bend\b/);
    expect(flow).toMatch(/\bdecision\b/);
    expect(p).toContain("kind: start");
  });
});

describe("icon vocabulary trimming", () => {
  const ids = (text: string) => text.split("\n").flatMap((l) => l.split(": ")[1].split(", "));

  it("lists only the requested categories, and only real registry ids", () => {
    const registry = new Set(listIcons().map((i) => i.id));
    const lines = iconVocabulary(["flow", "data"]).split("\n");
    expect(lines.map((l) => l.split(": ")[0])).toEqual(["data", "flow"]);
    for (const id of ids(iconVocabulary(["flow", "data"]))) expect(registry.has(id), id).toBe(true);
  });

  it("without a filter it is the full vocabulary, as before", () => {
    expect(iconVocabulary().split("\n").length).toBe(10);
  });

  it("adds hardware only when the request is about hardware", () => {
    expect(iconCategoriesFor({ diagramType: "architecture", prompt: "a web shop" })).not.toContain("hardware");
    expect(iconCategoriesFor({ diagramType: "architecture", prompt: "ESP32 sensor node over LoRa" })).toContain("hardware");
    expect(buildSystemPrompt("native", { diagramType: "architecture", prompt: "ESP32 sensor node" })).toContain("hardware: ");
    expect(buildSystemPrompt("native", { diagramType: "architecture", prompt: "a web shop" })).not.toContain("hardware: ");
  });
});

describe("examples per type", () => {
  it("shows one example, always one of the tested ones", () => {
    for (const type of [...TYPES, undefined]) {
      const picked = examplesFor(type, "x");
      expect(picked).toHaveLength(1);
      expect(EXAMPLES).toContain(picked[0]);
    }
  });

  it("flowcharts learn from the login flow, pipelines from the CI/CD example", () => {
    expect(examplesFor("flowchart")[0].request).toBe("Login flow");
    expect(examplesFor("architecture", "a deploy pipeline")[0].request).toContain("CI/CD");
    expect(examplesFor("architecture", "a web shop")[0].request).toContain("Web app");
  });
});

describe("inferDiagramType", () => {
  it.each([
    ["Draw a sequence diagram of OAuth login", "sequence"],
    ["ER diagram for a library database schema", "entity-relationship"],
    ["mind map about product launch", "mind-map"],
    ["UML class diagram for orders", "class"],
    ["org chart for a startup", "organization"],
    ["flowchart for password reset", "flowchart"],
    ["a login flow with retries", "flowchart"],
    ["workflow for onboarding", "workflow"],
    ["network topology with a DMZ", "network"],
    ["AWS microservices architecture", "architecture"],
    ["CI/CD pipeline", "architecture"],
  ])("%s -> %s", (prompt, expected) => expect(inferDiagramType(prompt)).toBe(expected));

  it("leaves a request that names nothing unknown", () => {
    expect(inferDiagramType("make it look nice")).toBeUndefined();
    expect(inferDiagramType("")).toBeUndefined();
  });

  it("an existing diagram's type line wins over the words of the request", () => {
    expect(inferDiagramType("add a database to the architecture", "type flowchart\nA > B")).toBe("flowchart");
    expect(inferDiagramType("add a cache", "type mind-map\nA > B")).toBe("mind-map");
    expect(inferDiagramType("add a cache", "type nonsense\nA > B")).toBeUndefined();
    expect(inferDiagramType("add a cache", "A > B")).toBeUndefined();
  });
});
