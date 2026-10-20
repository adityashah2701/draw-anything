import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasAgentView } from "@/features/whiteboard/components/overlays/canvas-agent-view";
import type { AgentUiMessage } from "@/features/canvas-tools/editor/use-canvas-agent";

const render = (messages: AgentUiMessage[], running = false) =>
  renderToStaticMarkup(
    React.createElement(CanvasAgentView, { messages, running, confirmation: null, onConfirm: () => {}, onStop: () => {}, onUndoRun: () => {}, canUndoRun: false, onExample: () => {}, disabled: false }),
  );

describe("CanvasAgentView: thinking", () => {
  const thinking: AgentUiMessage = { id: "t", kind: "thinking", text: "Plan: three boxes and two arrows.", source: "model" };

  it("shows the newest thinking open while the run is working, so it can be followed", () => {
    const html = render([{ id: "u", kind: "user", text: "draw" }, thinking], true);
    expect(html).toContain('data-testid="agent-thinking"');
    expect(html).toContain('data-live="true"');
    expect(html).toContain("Thinking…");
    expect(html).toContain("Plan: three boxes");
  });

  it("collapses it once the run has moved on or finished, but keeps it available", () => {
    const later = render([thinking, { id: "a", kind: "assistant", text: "Done." }], true);
    expect(later).toContain('data-live="false"');
    expect(later).toContain("Thought");
    expect(later).toContain('aria-expanded="false"');
    expect(later).not.toContain("Plan: three boxes");
    expect(render([thinking], false)).toContain('data-live="false"');
  });

  it("labels the diagram generator's notes as such", () => {
    expect(render([{ ...thinking, source: "generator" }], false)).toContain("diagram generator");
  });

  it("renders nothing extra for a conversation with no thinking", () => {
    expect(render([{ id: "u", kind: "user", text: "hi" }, { id: "a", kind: "assistant", text: "Hello." }])).not.toContain("agent-thinking");
  });
});

describe("CanvasAgentView: images", () => {
  it("shows thumbnails to the sender and only a count to everyone else", () => {
    const sent = render([{ id: "u", kind: "user", text: "copy this", images: 1, previews: ["data:image/jpeg;base64,AAAA"] }]);
    expect(sent).toContain('data-testid="agent-user-images"');
    const saved = render([{ id: "u", kind: "user", text: "copy this", images: 2 }]);
    expect(saved).not.toContain("<img");
    expect(saved).toContain("2 images attached");
  });
});
