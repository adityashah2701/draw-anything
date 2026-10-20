import { describe, expect, it } from "vitest";
import { compileDiagramCode } from "@/features/diagram-code/language/compile";
import { irFingerprint } from "@/features/diagram-code/language/ir";
import { boxOf, find, node, setup } from "../test-helpers";

const board = () => [node("web", "Web App", 100, 100, { ai: { semanticKind: "client" } }), node("api", "API", 400, 100, { ai: { semanticKind: "service" } }), node("db", "Database", 400, 400, { ai: { semanticKind: "database" } })];

const wired = async (extra = board()) => {
  const s = setup({ elements: extra, groups: ["create", "edit", "connect", "arrange", "organize", "document", "code"] });
  await s.ok("create_connector", { id: "w-a", from: "web", to: "api" });
  await s.ok("create_connector", { id: "a-d", from: "api", to: "db", label: "reads" });
  return s;
};
type Wired = Awaited<ReturnType<typeof wired>>;
const codeOf = async (s: Wired, args: object = {}) => (await s.ok("serialize_diagram", { format: "diagram_code", ...args })).data!.content as string;

describe("check_diagram_code", () => {
  it("validates, counts what it would draw and touches nothing", async () => {
    const s = await wired();
    const before = s.mem.stored;
    const result = await s.ok("check_diagram_code", { code: await codeOf(s) });
    expect(result.data).toMatchObject({ valid: true, nodes: 3, edges: 2, errors: [] });
    expect(result.summary).toMatch(/valid: 3 nodes, 2 connections/);
    expect(s.mem.stored).toBe(before);
  });

  it("names every error with line and column and a likely fix", async () => {
    const s = await wired();
    const result = await s.ok("check_diagram_code", { code: "API [kind: servce, colr: blue]\nAPI > Missing [" });
    const data = result.data as { valid: boolean; errors: Array<{ line: number; column?: number; code?: string; message: string }> };
    expect(data.valid).toBe(false);
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.errors[0]).toMatchObject({ line: expect.any(Number), message: expect.any(String) });
    expect(result.summary).toMatch(/error.*line \d+/);
  });

  it("formats without changing the diagram, idempotently, and refuses to guess at broken code", async () => {
    const s = await wired();
    const messy = "Web App   [kind:client]\nAPI[kind:service]\n\n\nWeb App>API";
    const first = await s.ok("check_diagram_code", { code: messy, format: true });
    const formatted = (first.data as { formatted: string }).formatted;
    expect(formatted).not.toBe(messy);
    const again = await s.ok("check_diagram_code", { code: formatted, format: true });
    expect(again.data).toMatchObject({ formatted, formatChanged: false });
    const [a, b] = [messy, formatted].map((code) => compileDiagramCode(code).ir);
    expect(irFingerprint(b)).toBe(irFingerprint(a));
    const broken = await s.ok("check_diagram_code", { code: "API [kind: ", format: true });
    expect((broken.data as { formatRefused?: string }).formatRefused).toBeTruthy();
    expect(broken.data).not.toHaveProperty("formatted");
  });

  it("returns the language reference from the language's own vocabulary", async () => {
    const s = await wired();
    const result = await s.ok("check_diagram_code", { code: "A", reference: true });
    const reference = (result.data as { reference: { shapes: string[]; connectors: string[]; blocks: string[] } }).reference;
    expect(reference.shapes).toEqual(expect.arrayContaining(["rectangle", "diamond"]));
    expect(reference.blocks.join(" ")).toMatch(/frame/);
  });
});

describe("apply_diagram_code", () => {
  it("adds a node and a connection and leaves every other element exactly as it was", async () => {
    const s = await wired();
    const before = s.mem.stored;
    const code = `${await codeOf(s)}\nQueue [kind: queue]\nAPI > Queue: publishes\n`;
    const result = await s.ok("apply_diagram_code", { code });
    expect(result.affected.created.length).toBeGreaterThanOrEqual(2);
    expect(result.affected.removed).toEqual([]);
    for (const id of ["web", "api", "db"]) expect(JSON.stringify(find(s.mem.stored, id)), id).toBe(JSON.stringify(find(before, id)));
    // The connector keeps its id, its ends and its route (its points may be rewritten without the anchor bookkeeping).
    const route = (items: typeof before) => JSON.stringify((find(items, "w-a") as unknown as { points: Array<{ x: number; y: number }> }).points.map(({ x, y }) => [x, y]));
    expect(route(s.mem.stored)).toBe(route(before));
    expect(find(s.mem.stored, "w-a")).toMatchObject({ startConnection: { elementId: "web" }, endConnection: { elementId: "api" } });
    const queue = s.mem.stored.find((e) => (e as { label?: string }).label === "Queue");
    expect(queue).toBeDefined();
    const arrows = s.mem.stored.filter((e) => e.type === "arrow") as Array<{ startConnection?: { elementId: string }; endConnection?: { elementId: string } }>;
    expect(arrows.some((a) => a.startConnection?.elementId === "api" && a.endConnection?.elementId === queue!.id)).toBe(true);
  });

  it("is one undo step", async () => {
    const s = await wired();
    const before = s.mem.stored;
    await s.ok("apply_diagram_code", { code: `${await codeOf(s)}\nQueue [kind: queue]\nAPI > Queue\n` });
    await s.mem.host.undo!();
    expect(s.mem.stored).toEqual(before);
  });

  it("changes a label and keeps the element, its id and its connectors", async () => {
    const s = await wired();
    const code = (await codeOf(s)).replace("Database [kind: database]", 'Database [kind: database, label: "Orders DB"]');
    await s.ok("apply_diagram_code", { code });
    expect(find(s.mem.stored, "db")).toMatchObject({ label: "Orders DB" });
    expect(find(s.mem.stored, "a-d")).toMatchObject({ endConnection: { elementId: "db" } });
  });

  it("keeps where a person put things when the code does not say", async () => {
    const s = await wired();
    await s.ok("move_elements", { ids: ["db"], dx: 77, dy: 10 });
    const at = boxOf(find(s.mem.stored, "db") as never);
    await s.ok("apply_diagram_code", { code: `${await codeOf(s)}\nQueue [kind: queue]\nAPI > Queue\n` });
    expect(boxOf(find(s.mem.stored, "db") as never)).toMatchObject({ x: at.x, y: at.y });
  });

  it("draws a frame block as a real frame that owns its nodes", async () => {
    const s = await wired();
    const code = 'Web App [kind: client]\nframe "Backend" {\n  API [kind: service]\n  Database [kind: database]\n}\n\nWeb App > API\nAPI > Database: reads\n';
    const result = await s.run("apply_diagram_code", { code });
    expect(result.ok, result.error?.message).toBe(true);
    const frames = s.mem.stored.filter((e) => e.type === "frame");
    expect(frames).toHaveLength(1);
    expect(find(s.mem.stored, "api")).toMatchObject({ frameId: frames[0].id });
    expect(find(s.mem.stored, "db")).toMatchObject({ frameId: frames[0].id });
    expect(find(s.mem.stored, "w-a")).toBeDefined();
  });

  it("leaves the board exactly as it was when the code has an error, and says where", async () => {
    const s = await wired();
    const before = s.mem.stored;
    const result = await s.run("apply_diagram_code", { code: `${await codeOf(s)}\nQueue [kind: queue\nAPI > Queue\n` });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_arguments");
    expect(result.error?.message).toMatch(/line \d+/);
    expect(result.error?.message).toMatch(/board was not changed/);
    expect(s.mem.stored).toBe(before);
  });

  it("refuses a code update that would drop many elements without confirmation", async () => {
    const many = Array.from({ length: 8 }, (_, i) => node(`n${i}`, `Node ${i}`, i * 200, 0));
    const s = setup({ elements: many, groups: ["code"] });
    const before = s.mem.stored;
    const result = await s.run("apply_diagram_code", { code: "Node 0\nNode 1" });
    expect(result.error?.code).toBe("confirmation_required");
    expect(s.mem.stored).toBe(before);
  });

  it("is refused when the board changed since the revision it was planned on", async () => {
    const s = await wired();
    const revision = (await s.ok("get_document_state", {})).revision;
    const code = await codeOf(s);
    await s.mem.host.applyPatch({ add: [node("other", "Other", 900, 900)], update: [], remove: [] });
    const result = await s.run("apply_diagram_code", { code, expected_revision: revision });
    expect(result.error?.code).toBe("stale_document");
  });

  it("says so when there is nothing to update", async () => {
    const s = setup({ groups: ["code"] });
    const result = await s.run("apply_diagram_code", { code: "A > B" });
    expect(result.error?.message).toMatch(/import_diagram/);
  });
});
