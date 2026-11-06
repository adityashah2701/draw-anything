import { describe, expect, it } from "vitest";
import { listIcons } from "@/core/icons/registry";
import type { AIDiagramType } from "@/features/ai/types";
import { EXAMPLES, examplesFor } from "./examples";
import { iconVocabulary } from "./icon-vocabulary";
import { PLAYBOOKS } from "./playbooks";
import { iconCategoriesFor, inferDiagramType, isSystemDesign } from "./prompt-context";
import { buildSystemPrompt } from "@/features/canvas-tools/agent/prompt";

/** Estimated tokens: characters / 4. An estimate of any tokenizer, not a count. */
const tokens = (text: string) => Math.ceil(text.length / 4);
const TYPES = Object.keys(PLAYBOOKS) as AIDiagramType[];

// Budgets are set from the measured sizes (see docs/superpowers/notes/2026-10-16-handoff-ai-shapes-colors.md)
// with about 10% headroom, so growing a prompt on purpose is a visible decision.
// Raised once for the structured-shape guidance (entity rows, class members, lifelines, relations) in the ER, class, sequence and mind-map playbooks.
const BUDGET = { complete: 3_700, typeUnknown: 2_300, typeKnown: 1_500 };

describe("system design requests", () => {
  it("are architecture and get the checklist and the chat example", () => {
    for (const prompt of ["Design WhatsApp", "How would you build Uber?", "system design of a video streaming platform", "Design a scalable URL shortener"]) {
      expect(inferDiagramType(prompt), prompt).toBe("architecture");
      expect(isSystemDesign(prompt), prompt).toBe(true);
      expect(buildSystemPrompt({ groups: ["inspect"], specs: [], protocol: "native", request: prompt })).toContain("SYSTEM DESIGN");
    }
    expect(isSystemDesign("design a login flow")).toBe(false);
    expect(inferDiagramType("design a database schema for a shop")).toBe("entity-relationship");
    expect(buildSystemPrompt({ groups: ["inspect"], specs: [], protocol: "native", request: "Kafka pipeline architecture" })).not.toContain("SYSTEM DESIGN");
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
