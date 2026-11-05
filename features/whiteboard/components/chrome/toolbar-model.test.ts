import { initializeShapeRegistry } from "@/core/shapes/register-shapes";
import { describe, expect, it } from "vitest";
import { getToolDefinitions } from "@/core/shapes/shape-tool-registry";
import { buildToolbar, FLYOUT_OUTLINES, type ToolbarEntry } from "./toolbar-model";

const names = (entries: ToolbarEntry[]) => entries.map((e) => (e.kind === "tool" ? e.tool.name : `${e.id}:${e.tools.map((t) => t.name).join(",")}`));

initializeShapeRegistry();

describe("buildToolbar", () => {
  const layout = buildToolbar(getToolDefinitions());

  it("keeps navigation as single tools, in order", () => {
    expect(names(layout.navigate)).toEqual(["select", "hand"]);
  });

  it("folds shapes, connectors and drawing tools into groups, with frequent tools one click away", () => {
    const create = names(layout.create);
    expect(create[0]).toMatch(/^shapes:rectangle,ellipse,diamond,pill,triangle/);
    expect(create[1]).toBe("connectors:arrow,arrow-bidirectional,line");
    expect(create[0]).toContain("frame");
    expect(create[0]).toContain("outline");
    expect(create[2]).toBe("insert:text,icon-picker");
    expect(create[3]).toMatch(/^draw:freehand/);
    expect(create[3]).toContain("eraser");
  });

  it("places every registered tool exactly once", () => {
    const all = [...layout.navigate, ...layout.create, ...layout.utility].flatMap((e) => (e.kind === "tool" ? [e.tool.name] : e.tools.map((t) => t.name)));
    const pickerOnly = (name: string) => name.startsWith("outline:") && !FLYOUT_OUTLINES.includes(name);
    expect(all.filter((n) => n !== "icon-picker" && n !== "shape-picker").sort()).toEqual(getToolDefinitions().map((d) => d.name).filter((n) => !pickerOnly(n)).sort());
  });

  it("keeps the Shapes flyout short: the basic shapes, a few outlines and the picker", () => {
    const shapes = layout.create[0];
    expect(shapes.kind === "group" && shapes.tools.length).toBeLessThanOrEqual(15);
    expect(shapes.kind === "group" && shapes.tools[shapes.tools.length - 1].name).toBe("shape-picker");
    const all = names(layout.create).join(" ") + names(layout.utility).join(" ");
    expect(all).not.toContain("outline:manual-operation");
  });

  it("puts a newly registered shape into the shapes flyout", () => {
    const defs = [...getToolDefinitions(), { name: "cylinder", icon: null, label: "Cylinder", group: "shapes" as const, order: 20, allowInReadOnly: false }];
    expect(names(buildToolbar(defs).create)[0]).toContain("cylinder");
  });
});
