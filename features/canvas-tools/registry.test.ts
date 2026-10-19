import { describe, expect, it } from "vitest";
import { buildTools, specsFor, STATIC_TOOLS, toolSpec, toolsByGroup } from "./registry";
import { TOOL_GROUPS } from "./types";

/** The capability list the editor must expose to the agent, by category. `create_image` is deliberately absent: the editor has no images. */
const REQUIRED: Record<string, string[]> = {
  creation: ["create_shape", "create_text", "create_icon", "create_semantic_node", "create_connector", "create_group", "create_frame_or_section", "duplicate_elements", "import_diagram"],
  editing: ["update_element", "update_text", "update_icon", "update_semantic_node", "update_shape_style", "move_elements", "resize_element", "rotate_elements", "align_elements", "distribute_elements", "set_element_spacing", "reorder_elements", "group_elements", "ungroup_elements", "lock_elements", "unlock_elements", "hide_elements", "show_elements", "rename_group"],
  connectors: ["connect_elements", "update_connector", "disconnect_elements", "update_connector_label", "reroute_connector", "delete_connector"],
  inspection: ["delete_elements", "get_document_state", "get_element_details", "find_elements", "get_selection", "select_elements", "clear_selection"],
  layout: ["auto_layout", "tidy_diagram", "validate_diagram", "apply_layout_preset", "zoom_to_fit"],
  document: ["undo_action", "redo_action", "clear_canvas", "export_diagram", "save_document", "load_document", "serialize_diagram", "validate_and_repair_diagram"],
};

const tools = buildTools(() => undefined);

describe("tool registry", () => {
  it.each(Object.entries(REQUIRED))("registers every %s tool", (_category, names) => {
    const have = new Set(tools.map((t) => t.name));
    expect(names.filter((name) => !have.has(name))).toEqual([]);
  });

  it("does not register a tool for a capability the editor lacks", () => {
    expect(tools.find((t) => /image/.test(t.name))).toBeUndefined();
  });

  it("has unique, well-formed names and real descriptions", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(30);
      expect(tool.description.length).toBeLessThan(700);
    }
  });

  it("puts every tool in a known group, and inspect holds the reads", () => {
    const groups = toolsByGroup(tools);
    expect(Object.keys(groups)).toEqual([...TOOL_GROUPS]);
    for (const tool of tools) expect(TOOL_GROUPS).toContain(tool.group);
    for (const tool of tools.filter((t) => t.group === "inspect")) expect(tool.access).toBe("read");
    for (const name of ["create_shape", "delete_elements", "auto_layout", "group_elements", "clear_canvas"]) {
      expect(tools.find((t) => t.name === name)?.access).toBe("write");
    }
  });

  it("makes every tool's arguments strict: an invented argument is an error", () => {
    for (const tool of tools) {
      const result = tool.input.safeParse({ __invented__: 1 });
      expect(result.success, tool.name).toBe(false);
      if (!result.success) expect(JSON.stringify(result.error.issues), tool.name).toMatch(/unrecognized|required|invalid|expected/i);
    }
  });

  it("gives providers valid object schemas that forbid extra properties", () => {
    for (const tool of tools) {
      const { parameters } = toolSpec(tool);
      expect(parameters.type, tool.name).toBe("object");
      expect(parameters.additionalProperties, tool.name).toBe(false);
      expect(parameters).not.toHaveProperty("$schema");
      expect(JSON.stringify(parameters), tool.name).not.toContain('"anyOf":[{"type":"string"},{"type":"null"}]');
    }
  });

  it("marks document-wide destructive tools as such and requires explicit confirmation", () => {
    for (const name of ["clear_canvas"]) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.destructive).toBe(true);
      expect(tool.input.safeParse({}).success).toBe(false);
      expect(tool.input.safeParse({ confirm: false }).success).toBe(false);
      expect(tool.input.safeParse({ confirm: true }).success).toBe(true);
    }
    const load = tools.find((t) => t.name === "load_document")!;
    expect(load.input.safeParse({ whiteboard_id: "abcdefgh12", mode: "replace" }).success).toBe(true);
  });

  it("keeps the schemas offered to the model within a token budget (size is measured, not guessed)", () => {
    const chars = (names: string[]) => JSON.stringify(tools.filter((t) => names.includes(t.name)).map(toolSpec)).length;
    const perGroup = Object.fromEntries(TOOL_GROUPS.map((g) => [g, chars(tools.filter((t) => t.group === g).map((t) => t.name))]));
    // ~3.6 characters per token: each group stays under ~4k tokens, and everything together under ~14k.
    for (const [group, size] of Object.entries(perGroup)) expect(size, group).toBeLessThan(15_000);
    expect(JSON.stringify(specsFor(tools, TOOL_GROUPS)).length).toBeLessThan(50_000);
  });

  it("only offers the tools of the enabled groups", () => {
    const names = specsFor(tools, ["inspect"]).map((s) => s.name);
    expect(names).toContain("get_document_state");
    expect(names).toContain("enable_tools");
    expect(names).not.toContain("create_shape");
    expect(STATIC_TOOLS.some((t) => t.name === "enable_tools")).toBe(false);
  });
});
