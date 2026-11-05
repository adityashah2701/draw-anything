import { describe, expect, it } from "vitest";
import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { buildFrameIndex } from "@/core/frames/frame-index";
import { EXAMPLES } from "@/features/ai/diagram-agent/prompt/examples";
import { elementsFromDiagramCode } from "@/features/diagram-code/canvas";
import { promoteGroupFrames } from "./promote-groups";

initializeShapeRegistry();

describe("generated groups on the board", () => {
  it("become frames that own their nodes, with the heading as title, and connection labels stay", () => {
    const code = EXAMPLES.find((e) => e.request.startsWith("Chat app system design"))!.code;
    const drawn = elementsFromDiagramCode(code, { generationId: "g", frameId: "f" }).elements;
    const out = promoteGroupFrames(drawn);
    const frames = out.filter((el) => el.type === "frame");
    expect(frames.map((f) => (f as { title?: string }).title).sort()).toEqual(["Clients", "Edge", "Media", "Messaging", "Realtime"]);
    expect(out.some((el) => el.ai?.role === "group" || el.ai?.role === "group-label")).toBe(false);
    expect(out.filter((el) => el.ai?.role === "edge-label").length).toBe(drawn.filter((el) => el.ai?.role === "edge-label").length);
    const index = buildFrameIndex(out as never);
    const owner = (label: string) => out.find((el) => el.label === label)!.frameId;
    const titleOf = (id: string | undefined) => (out.find((el) => el.id === id) as { title?: string } | undefined)?.title;
    expect(titleOf(owner("Message Queue"))).toBe("Messaging");
    expect(titleOf(owner("Mobile App"))).toBe("Clients");
    expect(out.find((el) => el.label === "Push Provider")!.frameId).toBeUndefined();
    // A frame is stored below what it owns.
    for (const f of frames) for (const id of index.childrenOf.get(f.id) ?? []) expect(out.findIndex((el) => el.id === f.id)).toBeLessThan(out.findIndex((el) => el.id === id));
  });
});
