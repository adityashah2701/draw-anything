import { describe, expect, it } from "vitest";
import type { StoredElement } from "@/features/whiteboard/types/whiteboard.types";
import { buildTools, toolSpec } from "../registry";
import { boxOf, find, node, setup } from "../test-helpers";
import { call, reply, scriptedRun, type ScriptStep } from "./test-support";

/**
 * The frame and diagram-code behaviours the agent is asked for, with a scripted model: the real handler, prompt,
 * argument checks, executor, tools and board; only the model's replies are written out. A passing test shows the
 * system does the right thing when the model asks for these tools: it does not show what a live model will choose.
 */

const kinds: Record<string, string> = { web: "client", mobile: "client", gateway: "gateway", auth: "auth", orders: "service", payments: "service", db: "database", cache: "cache" };
const labels: Record<string, string> = { web: "Web App", mobile: "Mobile App", gateway: "API Gateway", auth: "Auth Service", orders: "Orders Service", payments: "Payments Service", db: "Orders Database", cache: "Redis Cache" };
const spots: Record<string, [number, number]> = { web: [0, 0], mobile: [300, 0], gateway: [150, 200], auth: [0, 400], orders: [300, 400], payments: [600, 400], db: [300, 600], cache: [600, 600] };

const architecture = async (): Promise<StoredElement[]> => {
  const s = setup({ elements: Object.keys(labels).map((id) => node(id, labels[id], spots[id][0], spots[id][1], { ai: { semanticKind: kinds[id] } })) });
  for (const [from, to] of [["web", "gateway"], ["mobile", "gateway"], ["gateway", "auth"], ["gateway", "orders"], ["gateway", "payments"], ["orders", "db"], ["orders", "cache"]]) await s.ok("create_connector", { id: `${from}-${to}`, from, to });
  return [...s.mem.stored];
};

const failed = (run: Awaited<ReturnType<typeof scriptedRun>>["run"]) => run.results.filter((r) => !r.ok).map((r) => `${r.tool}:${r.error?.code}`);
const frames = (stored: readonly StoredElement[]) => stored.filter((e) => e.type === "frame") as Array<StoredElement & { title?: string }>;
const place = (e: StoredElement | undefined) => JSON.stringify((e as { points?: Array<{ x: number; y: number }> } | undefined)?.points?.map(({ x, y }) => [x, y]));
const same = (e: StoredElement | undefined) => JSON.stringify({ ...(e as object), frameId: undefined, points: undefined });
/** Everything that was on the board is still there, in the same place, with the same label, ends and style (only its frame may differ). */
const unmoved = (before: readonly StoredElement[], after: readonly StoredElement[]) => before.every((e) => place(after.find((a) => a.id === e.id)) === place(e) && same(after.find((a) => a.id === e.id)) === same(e));

describe("organising a diagram into frames", () => {
  it("makes separate Frontend, Backend and Database frames around the parts that are already there", async () => {
    const board = await architecture();
    const { run, mem, turns } = await scriptedRun({
      prompt: "Put the web and mobile apps in a Frontend frame, the services in a Backend frame and the data stores in a Database frame",
      board: { elements: board },
      script: [
        reply("Reading the board.", [call("get_document_state")]),
        reply("Framing the three areas.", [
          call("create_frame_or_section", { id: "fe", title: "Frontend", ids: ["web", "mobile"] }),
          call("create_frame_or_section", { id: "be", title: "Backend", ids: ["gateway", "auth", "orders", "payments"] }),
          call("create_frame_or_section", { id: "data", title: "Database", ids: ["db", "cache"] }),
        ]),
        reply("Checking.", [call("validate_diagram")]),
        reply("Added Frontend, Backend and Database frames around the existing parts."),
      ],
    });
    expect(run.status).toBe("done");
    expect(failed(run)).toEqual([]);
    expect(frames(mem.stored).map((f) => f.title)).toEqual(["Frontend", "Backend", "Database"]);
    expect(find(mem.stored, "auth")).toMatchObject({ frameId: "be" });
    expect(find(mem.stored, "cache")).toMatchObject({ frameId: "data" });
    // Nothing was recreated or moved, and every connector still joins the same two elements.
    expect(unmoved(board, mem.stored)).toBe(true);
    expect(turns[0].system).toContain("Group, frame or plain shape");
    expect(turns[0].specs).toEqual(expect.arrayContaining(["create_frame_or_section", "add_to_frame", "fit_frame", "list_frames"]));
  });

  it("frames the authentication components in a Security frame", async () => {
    const board = await architecture();
    const { run, mem } = await scriptedRun({
      prompt: "Put the authentication components in a Security frame",
      board: { elements: board },
      script: [
        reply("", [call("find_elements", { query: "auth" })]),
        reply("", [call("create_frame_or_section", { title: "Security", ids: ["auth"] })]),
        reply("Auth Service is now in a Security frame."),
      ],
    });
    expect(run.status).toBe("done");
    expect(run.results.filter((r) => !r.ok).map((r) => `${r.tool}: ${r.error?.message}`)).toEqual([]);
    expect(frames(mem.stored).map((f) => f.title)).toEqual(["Security"]);
    expect(find(mem.stored, "auth")).toMatchObject({ frameId: frames(mem.stored)[0].id });
  });

  it("frames a payment flow and fits the frame after the flow is rearranged", async () => {
    const board = await architecture();
    const { run, mem } = await scriptedRun({
      prompt: "Frame the payment flow, move payments to the right and fit the frame",
      board: { elements: board },
      script: [
        reply("", [call("create_frame_or_section", { id: "pay", title: "Payment flow", ids: ["gateway", "payments"] })]),
        reply("", [call("move_elements", { ids: ["payments"], dx: 200 })]),
        reply("", [call("fit_frame", { frame: "pay" })]),
        reply("The payment flow is framed and fitted."),
      ],
    });
    expect(failed(run)).toEqual([]);
    const frame = boxOf(find(mem.stored, "pay") as never);
    const payments = boxOf(find(mem.stored, "payments") as never);
    expect(payments.x + payments.w).toBeLessThanOrEqual(frame.x + frame.w);
    expect(payments.x).toBeGreaterThanOrEqual(frame.x);
  });

  it("renames a frame without moving anything", async () => {
    const framed = setup({ elements: await architecture() });
    await framed.ok("create_frame_or_section", { id: "be", title: "Backend", ids: ["auth", "orders"] });
    const before = [...framed.mem.stored];
    const { run, mem } = await scriptedRun({
      prompt: "Rename the Backend frame to Services",
      board: { elements: before },
      script: [reply("", [call("list_frames")]), reply("", [call("update_frame", { id: "be", title: "Services" })]), reply("Renamed it to Services.")],
    });
    expect(failed(run)).toEqual([]);
    expect(find(mem.stored, "be")).toMatchObject({ title: "Services" });
    const { title: _a, ...frameAfter } = find(mem.stored, "be") as never as Record<string, unknown>;
    const { title: _b, ...frameBefore } = find(before, "be") as never as Record<string, unknown>;
    void _a;
    void _b;
    expect(frameAfter).toEqual(frameBefore);
    expect(unmoved(before.filter((e) => e.id !== "be"), mem.stored)).toBe(true);
  });

  it("adds a queue to the Backend frame and connects it", async () => {
    const framed = setup({ elements: await architecture() });
    await framed.ok("create_frame_or_section", { id: "be", title: "Backend", ids: ["gateway", "auth", "orders", "payments"] });
    const { run, mem } = await scriptedRun({
      prompt: "Add a message queue to the Backend frame and connect it to Orders",
      board: { elements: [...framed.mem.stored] },
      script: [
        reply("", [call("list_frames")]),
        reply("", [
          call("create_semantic_node", { id: "queue", label: "Message Queue", kind: "queue", x: 300, y: 520 }),
          call("add_to_frame", { frame: "be", ids: ["queue"] }),
          call("create_connector", { id: "orders-queue", from: "orders", to: "queue" }),
        ]),
        reply("", [call("validate_diagram")]),
        reply("Added the queue to Backend and connected it to Orders."),
      ],
    });
    expect(failed(run)).toEqual([]);
    expect(find(mem.stored, "queue")).toMatchObject({ frameId: "be" });
    expect(find(mem.stored, "orders-queue")).toMatchObject({ startConnection: { elementId: "orders" }, endConnection: { elementId: "queue" } });
    const frame = boxOf(find(mem.stored, "be") as never);
    const queue = boxOf(find(mem.stored, "queue") as never);
    expect(queue.y + queue.h).toBeLessThanOrEqual(frame.y + frame.h);
  });
});

describe("invalid frame operations come back as errors the model can act on", () => {
  it("answers a bad frame id, a shape given as a frame, a wrong argument and a locked frame, and the board stays whole", async () => {
    const framed = setup({ elements: await architecture() });
    await framed.ok("create_frame_or_section", { id: "be", title: "Backend", ids: ["auth", "orders"] });
    await framed.ok("create_frame_or_section", { id: "ro", title: "Locked", ids: ["web"] });
    await framed.ok("lock_elements", { ids: ["ro"] });
    const before = [...framed.mem.stored];
    const { run, mem, turns } = await scriptedRun({
      prompt: "Move the cache into the Cache frame",
      board: { elements: before },
      script: [
        reply("", [call("add_to_frame", { frame: "cache-frame", ids: ["cache"] })]),
        reply("", [call("add_to_frame", { frame: "orders", ids: ["cache"] })]),
        reply("", [call("add_to_frame", { frame: "be", members: "cache", fit: "yes" })]),
        reply("", [call("add_to_frame", { frame: "ro", ids: ["mobile"] })]),
        reply("I could not do that: there is no Cache frame, and the Locked frame is locked."),
      ],
    });
    expect(failed(run)).toEqual(["add_to_frame:not_found", "add_to_frame:invalid_state", "add_to_frame:invalid_arguments", "add_to_frame:locked"]);
    expect(mem.stored).toEqual(before);
    // The third call named the real arguments; the model saw what to fix.
    expect(turns[3].messages.some((m) => m.role === "tool" && /takes only: frame, ids, fit/.test(m.content))).toBe(true);
  });

  it("refuses frame arguments that fail the tool's schema before they reach the board", async () => {
    const board = await architecture();
    const { run, mem } = await scriptedRun({
      prompt: "Frame things",
      board: { elements: board },
      script: [reply("", [call("create_frame_or_section", { title: "", ids: ["web"] })]), reply("", [call("update_frame", { id: "x", padding: -5 })]), reply("Those were not valid.")],
    });
    expect(failed(run)).toEqual(["create_frame_or_section:invalid_arguments", "update_frame:invalid_arguments"]);
    expect(mem.stored).toEqual(board);
  });

  it("stops after a revision conflict and carries on once the board is re-read", async () => {
    const framed = setup({ elements: await architecture() });
    await framed.ok("create_frame_or_section", { id: "be", title: "Backend", ids: ["auth", "orders"] });
    const { run, mem } = await scriptedRun({
      prompt: "Delete the Backend frame",
      board: { elements: [...framed.mem.stored] },
      script: [
        reply("", [call("get_document_state")]),
        // A collaborator draws a note between the model's look and its change.
        ({ mem }) => {
          void mem.host.applyPatch({ add: [node("note", "Note", 900, 900)], update: [], remove: [] });
          return reply("", [call("delete_frame", { id: "be" })]);
        },
        reply("", [call("get_document_state")]),
        reply("", [call("delete_frame", { id: "be" })]),
        reply("Deleted the Backend frame; its contents stay."),
      ],
    });
    expect(failed(run)).toEqual(["delete_frame:stale_document"]);
    expect(mem.stored.some((e) => e.id === "be")).toBe(false);
    expect(find(mem.stored, "auth")).toBeDefined();
    expect(find(mem.stored, "note")).toBeDefined();
  });
});

describe("diagram code", () => {
  const read = (run: Awaited<ReturnType<typeof scriptedRun>>["run"], tool: string) => run.results.find((r) => r.tool === tool);

  it("converts an architecture to code that keeps every relationship", async () => {
    const board = await architecture();
    const { run, mem } = await scriptedRun({
      prompt: "Convert this architecture to diagram code",
      board: { elements: board },
      script: [
        reply("", [call("serialize_diagram", { format: "diagram_code" })]),
        ({ results }) => reply("", [call("check_diagram_code", { code: (results[0].data as { content: string }).content })]),
        reply("Here is the diagram as code."),
      ],
    });
    expect(failed(run)).toEqual([]);
    const code = (read(run, "serialize_diagram")!.data as { content: string }).content;
    for (const edge of ["Web App > API Gateway", "Mobile App > API Gateway", "API Gateway > Auth Service", "API Gateway > Orders Service", "API Gateway > Payments Service", "Orders Service > Orders Database", "Orders Service > Redis Cache"]) expect(code).toContain(edge);
    expect(read(run, "check_diagram_code")!.data).toMatchObject({ valid: true, nodes: 8, edges: 7 });
    expect(mem.stored).toEqual(board);
  });

  it("converts a framed architecture to code with its frames", async () => {
    const framed = setup({ elements: await architecture() });
    await framed.ok("create_frame_or_section", { id: "be", title: "Backend", ids: ["auth", "orders", "payments"] });
    const { run } = await scriptedRun({ prompt: "Show this as code", board: { elements: [...framed.mem.stored] }, script: [reply("", [call("serialize_diagram", { format: "diagram_code" })]), reply("Done.")] });
    const code = (read(run, "serialize_diagram")!.data as { content: string }).content;
    expect(code).toMatch(/frame "?Backend"? \{[\s\S]*Auth Service[\s\S]*\}/);
  });

  it("reformats code without changing the diagram", async () => {
    const board = await architecture();
    const messy = "Web App[kind:client]\nAPI Gateway   [kind:gateway]\n\n\n\nWeb App>API Gateway";
    const { run, mem } = await scriptedRun({
      prompt: "Format this code: " + messy.replace(/\n/g, " / "),
      board: { elements: board },
      script: [reply("", [call("check_diagram_code", { code: messy, format: true })]), reply("Formatted; the board was not touched.")],
    });
    expect(failed(run)).toEqual([]);
    expect((read(run, "check_diagram_code")!.data as { formatted: string }).formatted).not.toBe(messy);
    expect(mem.stored).toEqual(board);
  });

  it("applying the board's own code back is a no-op", async () => {
    const drawn = setup({ groups: ["create", "code"] });
    await drawn.ok("import_diagram", { code: 'Web App [kind: client]\nAPI Gateway [kind: gateway]\nOrders Service [kind: service]\nOrders Database [kind: database]\nWeb App > API Gateway\nAPI Gateway > Orders Service\nOrders Service > Orders Database: reads\n' });
    const board = [...drawn.mem.stored];
    const { run, mem } = await scriptedRun({
      prompt: "Apply this code",
      board: { elements: board },
      script: [reply("", [call("serialize_diagram", { format: "diagram_code" })]), ({ results }) => reply("", [call("apply_diagram_code", { code: (results[0].data as { content: string }).content })]), reply("Applied.")],
    });
    expect(run.results.filter((r) => !r.ok).map((r) => `${r.tool}: ${r.error?.message}`)).toEqual([]);
    expect(run.results.at(-1)).toMatchObject({ summary: expect.stringMatching(/Nothing changed/), affected: { created: [], updated: [], removed: [] } });
    expect(mem.stored).toEqual(board);
  });

  it("fixes a syntax error from the diagnostics while the last valid canvas stays", async () => {
    const board = await architecture();
    const broken = "Web App [kind: client\nAPI Gateway [kind: gateway]\nWeb App > API Gateway";
    const fixed = "Web App [kind: client]\nAPI Gateway [kind: gateway]\nWeb App > API Gateway";
    const { run, mem } = await scriptedRun({
      prompt: "Apply this diagram code",
      board: { elements: board },
      script: [
        reply("", [call("apply_diagram_code", { code: broken })]),
        ({ results }) => reply(`The tool says: ${results[0].error?.message?.slice(0, 80)}`, [call("check_diagram_code", { code: broken })]),
        reply("", [call("check_diagram_code", { code: fixed })]),
        reply("Checked; the corrected code is valid. I did not apply it because it leaves out most of the diagram."),
      ],
    });
    expect(run.results[0]).toMatchObject({ ok: false, error: { code: "invalid_arguments" } });
    expect(run.results[0].error?.message).toMatch(/board was not changed/);
    expect(read(run, "check_diagram_code")!.data).toMatchObject({ valid: false });
    expect(mem.stored).toEqual(board);
  });

  it("does not loop on the same broken code: the run is stopped with the board untouched", async () => {
    const board = await architecture();
    const same = reply("", [call("apply_diagram_code", { code: "Web App [kind: client" })]);
    const { run, mem } = await scriptedRun({ prompt: "Apply this code", board: { elements: board }, script: Array(8).fill(same) });
    expect(run.status).toBe("stalled");
    expect(run.steps).toBeLessThanOrEqual(4);
    expect(mem.stored).toEqual(board);
  });

  it("adds a node and a connection through edited code", async () => {
    const board = await architecture();
    const { run, mem } = await scriptedRun({
      prompt: "Add a Queue after Orders using the diagram code",
      board: { elements: board },
      script: [
        reply("", [call("serialize_diagram", { format: "diagram_code" })]),
        ({ results }) => reply("", [call("apply_diagram_code", { code: `${(results[0].data as { content: string }).content}\nQueue [kind: queue]\nOrders Service > Queue: publishes\n` })]),
        reply("Added Queue."),
      ],
    });
    expect(failed(run)).toEqual([]);
    expect(mem.stored.some((e) => (e as { label?: string }).label === "Queue")).toBe(true);
    expect(run.results[1].affected.created.length).toBeGreaterThanOrEqual(2);
  });
});

describe("tool schemas", () => {
  it("every frame and code tool offers strict object parameters and rejects an invented argument", () => {
    const tools = buildTools(() => undefined).filter((t) => /frame|diagram_code/.test(t.name));
    expect(tools.map((t) => t.name).sort()).toEqual(["add_to_frame", "apply_diagram_code", "check_diagram_code", "create_frame_or_section", "delete_frame", "fit_frame", "list_frames", "remove_from_frame", "resize_frame", "update_frame"]);
    for (const tool of tools) {
      const { parameters } = toolSpec(tool);
      expect(parameters.additionalProperties, tool.name).toBe(false);
      expect(tool.input.safeParse({ __invented__: 1 }).success, tool.name).toBe(false);
    }
  });
});
