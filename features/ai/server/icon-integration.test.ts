import { describe, expect, it } from "vitest";
import { compileAIDiagramToCanvas } from "@/features/ai/server/canvas-compiler";
import { normalizeModelGraphDraftDetailed } from "@/features/ai/schemas";
import { documentFromParsedCode, graphFromElements } from "@/features/diagram-code/canvas";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { serializeDiagramCode } from "@/features/diagram-code/serialize";
import { iconForNode, listIcons } from "@/core/icons/registry";
import { LAYOUT_FIXTURES } from "./layout/fixtures";

describe("icons through the AI pipeline", () => {
  it("accepts model output with an icon, a vendor-word kind, a junk icon and no icon (Groq-style lenient input)", () => {
    const { graph } = normalizeModelGraphDraftDetailed({
      nodes: [
        { id: "a", label: "Orders DB", kind: "database", icon: "postgres" },
        { id: "b", label: "Events", kind: "kafka" },
        { id: "c", label: "MCU", kind: "service", icon: "esp32" },
        { id: "d", label: "Junk", kind: "service", icon: { nope: true } },
        { id: "e", label: "Plain", kind: "service" },
      ],
      edges: [],
    });
    const by = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    expect(by.a.icon).toBeUndefined(); // postgres is the database icon already
    expect(by.b.kind).toBe("message-broker");
    expect(by.c.icon).toBe("microcontroller");
    expect(by.d.icon).toBeUndefined();
    expect(by.e.icon).toBeUndefined();
  });

  it("stores the icon on the element, and every compiled node resolves to a real icon", () => {
    const doc = structuredClone(LAYOUT_FIXTURES.architecture);
    doc.nodes[0].icon = "microcontroller";
    const nodes = compileAIDiagramToCanvas(doc, "f").filter((e) => e.type === "semantic-node");
    expect(nodes.find((n) => n.ai?.semanticId === doc.nodes[0].id)?.ai?.icon).toBe("microcontroller");
    const ids = new Set(listIcons().map((i) => i.id));
    for (const n of nodes) expect(ids.has(iconForNode(n.ai).id)).toBe(true);
  });

  it("an element saved before icons existed (no ai.icon) still gets its kind's icon", () => {
    expect(iconForNode({ semanticKind: "message-broker" }).id).toBe("message-broker");
  });
});

describe("icons through the diagram code", () => {
  it("round-trips an explicit icon", () => {
    const code = `type flowchart\nSensor [kind: service, icon: esp32]\nCloud [kind: database]\nSensor > Cloud`;
    const { document: doc } = documentFromParsedCode(parseDiagramCode(code), "g");
    const sensor = doc.nodes.find((n) => n.label === "Sensor")!;
    expect(sensor.icon).toBe("microcontroller");
    const elements = compileAIDiagramToCanvas(doc, "f");
    const graph = graphFromElements(elements);
    expect(serializeDiagramCode({ ...graph.graph, diagramType: "flowchart" } as never)).toContain("icon: microcontroller");
  });

  it("still reads the old `icon: db` spelling as a kind", () => {
    const { document: doc } = documentFromParsedCode(parseDiagramCode(`A [icon: db]`), "g");
    expect(doc.nodes[0].kind).toBe("database");
  });
});
