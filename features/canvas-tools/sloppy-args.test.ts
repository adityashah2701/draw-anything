import { describe, expect, it } from "vitest";
import { coerceArgs } from "./args";
import { buildTools } from "./registry";
import { toParameters } from "./schemas";

/**
 * Audit of every tool for the failure seen live: a model sends the right thing in the wrong JSON shape (an icon
 * result object, a one-item list, a number, "Decision", an empty string) and the whole call is refused. For each
 * top-level text and choice argument of every tool, the wrong shape must be read as the right one.
 */
const tools = buildTools(() => undefined);
type Prop = { type?: string | string[]; enum?: unknown[] };
const propsOf = (tool: (typeof tools)[number]) => Object.entries(((toParameters(tool.input) as { properties?: Record<string, Prop> }).properties ?? {}));
const isText = (p: Prop) => p.type === "string" && !p.enum;

describe("argument shapes a model gets wrong", () => {
  it("reads a name wrapped in an object, a one-item list or a number as text, for every text argument of every tool", () => {
    const failures: string[] = [];
    for (const tool of tools) {
      for (const [name, prop] of propsOf(tool).filter(([, p]) => isText(p))) {
        const wrapped = coerceArgs(tool, { [name]: { id: "cloud", category: "x" } }).args as Record<string, unknown>;
        const listed = coerceArgs(tool, { [name]: ["cloud"] }).args as Record<string, unknown>;
        const numeric = coerceArgs(tool, { [name]: 7 }).args as Record<string, unknown>;
        if (wrapped[name] !== "cloud") failures.push(`${tool.name}.${name} object`);
        if (listed[name] !== "cloud") failures.push(`${tool.name}.${name} list`);
        if (numeric[name] !== "7") failures.push(`${tool.name}.${name} number`);
        void prop;
      }
    }
    expect(failures).toEqual([]);
  });

  it("reads a choice written in other letters as the listed choice, for every choice argument of every tool", () => {
    const failures: string[] = [];
    for (const tool of tools) {
      for (const [name, prop] of propsOf(tool).filter(([, p]) => p.type === "string" && p.enum)) {
        const choice = String(prop.enum![0]);
        const loud = coerceArgs(tool, { [name]: choice.toUpperCase() }).args as Record<string, unknown>;
        if (loud[name] !== choice) failures.push(`${tool.name}.${name} ${choice}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("leaves out an optional text argument sent empty, but keeps a required one", () => {
    const nodes = tools.find((t) => t.name === "create_nodes")!;
    const out = coerceArgs(nodes, { nodes: [{ id: "a", label: "A", icon: "", x: 0, y: 0 }] }).args as { nodes: Array<Record<string, unknown>> };
    expect("icon" in out.nodes[0]).toBe(false);
    expect(out.nodes[0].label).toBe("A");
    const blank = coerceArgs(nodes, { nodes: [{ id: "a", label: "", x: 0, y: 0 }] }).args as { nodes: Array<Record<string, unknown>> };
    expect(blank.nodes[0].label).toBe("");
  });
});
