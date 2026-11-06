import { describe, expect, it } from "vitest";
import { parseDiagramCode } from "@/features/diagram-code/parse";
import { expandInlineBlocks } from "./builder";

describe("expandInlineBlocks", () => {
  it("turns one-line blocks into code the language reads, keeping quotes and brackets", () => {
    const code = 'frame Edge { CDN [icon: cdn, shape: icon], Load Balancer }\nframe Data { Users [shape: entity, rows: "id int pk; name text"]; Cache Cluster { Redis } }\nframe Media {\n  Media Service\n}\nCDN > Load Balancer: "HTTPS {tls}"';
    const out = expandInlineBlocks(code);
    expect(out).toContain('Users [shape: entity, rows: "id int pk; name text"]');
    const parsed = parseDiagramCode(out);
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(parsed.nodes.map((n) => n.name).sort()).toEqual(["CDN", "Cache Cluster", "Load Balancer", "Media Service", "Redis", "Users"].filter((n) => n !== "Cache Cluster").sort());
  });
});

describe("withDefaultShapes", () => {
  it("draws components as captioned icons and steps as boxes, leaving shaped nodes, decisions and connections alone", async () => {
    const { withDefaultShapes } = await import("./builder");
    const out = withDefaultShapes('frame Edge {\n  CDN [icon: cdn]\n  Validate order\n  Pay? [kind: decision]\n  Users [shape: entity, rows: "id int pk"]\n}\nCDN > Validate order: HTTPS\nAPI [color: blue]');
    expect(out).toContain("CDN [shape: icon, icon: cdn]");
    expect(out).toContain("Validate order [shape: rectangle]");
    expect(out).toContain("Pay? [kind: decision]");
    expect(out).toContain('Users [shape: entity, rows: "id int pk"]');
    expect(out).toContain("CDN > Validate order: HTTPS");
    expect(out).toContain("API [shape: rectangle, color: blue]");
    expect(parseDiagramCode(out).issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
