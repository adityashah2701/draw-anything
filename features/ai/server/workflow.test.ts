import { describe, expect, it } from "vitest";
import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";
import { StructuredChatModel } from "@/features/ai/server/model-providers";

class MockStructuredModel {
  private calls = 0;

  withStructuredOutput<T extends Record<string, unknown>>(_schema: unknown) {
    return {
      invoke: async (): Promise<T> => {
        this.calls += 1;
        if (this.calls === 1) {
          return {
            diagramType: "architecture",
            summary: "Client talks to API",
            layoutStrategy: "layered",
            direction: "top-to-bottom",
            styleTheme: "technical",
            density: "balanced",
            requirements: [
              {
                id: "client-api",
                text: "Client talks to API",
                priority: "must",
                source: "prompt",
              },
            ],
            actors: ["Client"],
            systems: ["API"],
            nonFunctionalRequirements: [],
            risks: [],
          } as unknown as T;
        }
        return {
          nodes: [
            { id: "client", label: "Client", kind: "browser" },
            { id: "api", label: "API", kind: "api" },
          ],
          edges: [{ id: "calls", from: "client", to: "api" }],
          groups: [],
        } as unknown as T;
      },
    };
  }
}

describe("AI LangGraph workflow", () => {
  it("streams frame, validation, element, and done events", async () => {
    const events = [];
    for await (const event of streamAIDiagramWorkflowEvents({
      request: {
        prompt: "Client API architecture",
        provider: "gemini",
      },
      model: new MockStructuredModel() as unknown as StructuredChatModel,
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "frame.created")).toBe(true);
    expect(events.some((event) => event.type === "memory.loaded")).toBe(true);
    expect(events.some((event) => event.type === "requirements.extracted")).toBe(true);
    expect(events.some((event) => event.type === "critic.report")).toBe(true);
    expect(events.some((event) => event.type === "validation.report")).toBe(true);
    expect(events.some((event) => event.type === "element.batch")).toBe(true);
    expect(events.at(-1)?.type).toBe("frame.done");
  });

  it("applies a repair pass after invalid generated output", async () => {
    const events = [];
    class RepairModel extends MockStructuredModel {
      private repairCalls = 0;

      withStructuredOutput<T extends Record<string, unknown>>(_schema: unknown) {
        return {
          invoke: async (): Promise<T> => {
            this.repairCalls += 1;
            if (this.repairCalls === 1) {
              return {
                diagramType: "architecture",
                summary: "Broken then repaired",
                layoutStrategy: "layered",
                direction: "top-to-bottom",
                styleTheme: "technical",
                density: "balanced",
              } as unknown as T;
            }
            if (this.repairCalls < 4) {
              return {
                nodes: [{ id: "api", label: "API", kind: "api" }],
                edges: [{ from: "api", to: "missing" }],
                groups: [],
              } as unknown as T;
            }
            return {
              nodes: [
                { id: "client", label: "Client", kind: "browser" },
                { id: "api", label: "API", kind: "api" },
                { id: "database", label: "Database", kind: "database" },
              ],
              edges: [
                { from: "client", to: "api" },
                { from: "api", to: "database" },
              ],
              groups: [],
            } as unknown as T;
          },
        };
      }
    }

    for await (const event of streamAIDiagramWorkflowEvents({
      request: {
        prompt: "Client API architecture",
        provider: "gemini",
      },
      model: new RepairModel() as unknown as StructuredChatModel,
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "repair.applied")).toBe(true);
    expect(events.at(-1)?.type).toBe("frame.done");
  });
});
