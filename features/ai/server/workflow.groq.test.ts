import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatGroq } from "@langchain/groq";
import { createPromptedStructuredModel } from "@/features/ai/server/model-providers";
import { streamAIDiagramWorkflowEvents } from "@/features/ai/server/workflow";
import type { AIStreamEvent } from "@/features/ai/types";

/**
 * "Flowchart for a user login process" end to end, through the real ChatGroq
 * client (gpt-oss model id) against a local stand-in for Groq that answers the
 * way the model did in production: every optional field present as null, free-form
 * `kind` words, labels as long as it likes. No live service is involved.
 */
const nullable = { layer: null, column: null, parentId: null, description: null, priority: null };
const node = (id: string, label: string, kind: string) => ({ id, label, kind, ...nullable });
const edge = (from: string, to: string, label: string | null = null) => ({
  id: null, from, to, label, relationship: null, bidirectional: null, dashed: null,
});

const planAnswer = {
  diagramType: "flowchart",
  summary: "Login flow with credential check and failure path",
  requirements: [{ id: "r1", text: "User signs in with email and password", priority: "must", source: "prompt" }],
  actors: ["User"],
  systems: ["Auth service"],
  nonFunctionalRequirements: null,
  risks: null,
  layoutStrategy: "layered",
  direction: "top-to-bottom",
  styleTheme: "technical",
  density: "balanced",
};

const graphAnswer = {
  nodes: [
    node("start", "Start", "start"),
    node("open", "Open login page", "process"),
    node("enter", "Enter email and password", "input"),
    node("check", "Credentials valid?", "decision"),
    node("mfa", "Second factor required?", "decision"),
    node("session", "Create session", "process"),
    node("error", "Show error message", "process"),
    node("done", "Go to dashboard", "end"),
  ],
  edges: [
    edge("start", "open"), edge("open", "enter"), edge("enter", "check"),
    edge("check", "mfa", "yes"), edge("check", "error", "no"), edge("error", "enter", "retry"),
    edge("mfa", "session", "no"), edge("session", "done"),
  ],
  groups: null,
};

let server: Server;
let baseUrl = "";
const requests: Array<{ response_format?: unknown; tools?: unknown; messages: Array<{ content: string }> }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const request = JSON.parse(body);
      requests.push(request);
      const last: string = request.messages.at(-1)?.content ?? "";
      const answer = /"diagramType"/.test(last) && /"summary"/.test(last) ? planAnswer : graphAnswer;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "c", object: "chat.completion", created: 1, model: "openai/gpt-oss-120b",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(answer) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

describe("login flowchart through the Groq client", () => {
  it("completes with a compiled diagram and no errors", async () => {
    const model = createPromptedStructuredModel(
      new ChatGroq({ model: "openai/gpt-oss-120b", apiKey: "test-key-not-real", baseUrl }),
    );
    const events: AIStreamEvent[] = [];
    for await (const event of streamAIDiagramWorkflowEvents({
      request: { prompt: "Flowchart for a user login process", provider: "groq" },
      model,
    })) {
      events.push(event);
    }

    const types = events.map((event) => event.type);
    expect(types).not.toContain("frame.error");
    expect(types).not.toContain("error");
    expect(types).toContain("frame.done");

    const elements = events.flatMap((event) => (event.type === "element.batch" ? event.elements : []));
    const nodesOnCanvas = elements.filter((el) => el.ai?.role === "node");
    const arrows = elements.filter((el) => el.type === "arrow");
    expect(nodesOnCanvas.length).toBeGreaterThanOrEqual(8);
    expect(arrows.length).toBeGreaterThanOrEqual(8);
    expect(nodesOnCanvas.map((el) => el.label)).toContain("Credentials valid?");

    // Never Groq's strict or tool modes: the schema travels in the prompt.
    expect(requests.length).toBeGreaterThanOrEqual(2);
    for (const request of requests) {
      expect(request.response_format).toBeUndefined();
      expect(request.tools).toBeUndefined();
    }
  });
});
