import { describe, expect, it } from "vitest";
import { setup } from "./test-helpers";

describe("smoke", () => {
  it("builds a small architecture and reads it back", async () => {
    const { run, ok, mem } = setup();
    await ok("create_semantic_node", { id: "api", label: "API Service", kind: "service", x: 0, y: 0 });
    await ok("create_semantic_node", { id: "auth", label: "Auth Service", kind: "service", x: 300, y: 0 });
    await ok("create_semantic_node", { id: "db", label: "PostgreSQL", icon: "postgres", kind: "database", x: 150, y: 220 });
    const connect = await ok("connect_elements", { connections: [{ from: "api", to: "auth", label: "verify" }, { from: "api", to: "db" }, { from: "auth", to: "db" }] });
    expect(connect.affected.created.length).toBeGreaterThanOrEqual(3);
    const state = await ok("get_document_state");
    expect(state.data).toMatchObject({ counts: { elements: 3, connectors: 3 } });
    const validation = await ok("validate_diagram");
    console.log(JSON.stringify(validation.data, null, 1).slice(0, 1500));
    const bad = await run("create_shape", { shape: "rectangle", bogus: 1 });
    expect(bad.error?.code).toBe("invalid_arguments");
    expect(mem.stored.length).toBeGreaterThan(5);
  });
});
