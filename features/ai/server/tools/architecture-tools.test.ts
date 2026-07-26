import { describe, expect, it } from "vitest";
import { expandInfrastructure } from "@/features/ai/server/tools/infrastructure-expander";
import { lookupMemoryContext } from "@/features/ai/server/tools/memory-lookup";
import { extractRequirementsFromPrompt } from "@/features/ai/server/validation";

describe("AI architecture tools", () => {
  it("normalizes prompt requirements", () => {
    const requirements = extractRequirementsFromPrompt(
      "Build ecommerce architecture. Include async order processing.",
    );

    expect(requirements).toHaveLength(2);
    expect(requirements[0]).toMatchObject({
      priority: "must",
      source: "prompt",
    });
  });

  it("expands ecommerce infrastructure deterministically", () => {
    const expanded = expandInfrastructure(
      { prompt: "Production ecommerce architecture with async orders" },
      {
        nodes: [
          { id: "web", label: "Web App", kind: "browser", layer: "edge" },
          { id: "api", label: "API", kind: "api", layer: "application" },
        ],
        edges: [{ from: "web", to: "api" }],
      },
    );

    expect(expanded.addedNodeIds).toContain("waf");
    expect(expanded.addedNodeIds).toContain("queue");
    expect(expanded.graph.nodes.length).toBeGreaterThan(2);
  });

  it("uses memory fallback when no persisted memories are available", async () => {
    const memory = await lookupMemoryContext({
      prompt: "AI agent architecture",
      canvasContext: { elements: [], selectedElementIds: [] },
    });

    expect(memory.fallbackUsed).toBe(true);
    expect(memory.memories).toEqual([]);
    expect(memory.canvasSummary).toContain("Canvas has 0 elements");
  });
});
