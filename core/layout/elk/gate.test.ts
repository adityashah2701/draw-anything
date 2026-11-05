import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ELK_GATE, elkAlgorithmEnabled, reportMeetsGate, type GateReport } from "./gate";
import { loadElk } from "./loader";

const good = (): GateReport => ({
  engine: "er", algorithm: "stress", elkVersion: "0.12.0", licenceReviewed: true,
  fixtures: [{ name: "a", notWorseThanNative: true, overlaps: 0 }, { name: "b", notWorseThanNative: true, overlaps: 0 }],
  deterministic: true, incrementalContractHolds: true, p95Ms300: 400,
});

describe("the ELK gate", () => {
  it("ships with every ELK algorithm disabled", () => {
    expect(ELK_GATE.length).toBeGreaterThan(0);
    expect(ELK_GATE.every((entry) => !entry.enabled)).toBe(true);
    expect(elkAlgorithmEnabled("er", "stress")).toBe(false);
    expect(elkAlgorithmEnabled("nothing", "here")).toBe(false);
  });

  it("an enabled entry must point at a committed report that meets the gate", () => {
    for (const entry of ELK_GATE.filter((e) => e.enabled)) {
      expect(entry.report, `${entry.engine}/${entry.algorithm} is enabled without a report`).toBeTruthy();
      const path = join(process.cwd(), entry.report!);
      expect(existsSync(path), `${entry.report} does not exist`).toBe(true);
      const result = reportMeetsGate(JSON.parse(readFileSync(path, "utf8")) as GateReport);
      expect(result.failures, `${entry.engine}/${entry.algorithm}`).toEqual([]);
    }
  });

  it("passes a good report and names every way a report can fail", () => {
    expect(reportMeetsGate(good())).toEqual({ passes: true, failures: [] });
    const bad = reportMeetsGate({
      ...good(), licenceReviewed: false, deterministic: false, incrementalContractHolds: false, p95Ms300: 5000,
      fixtures: [{ name: "a", notWorseThanNative: false, overlaps: 2 }, { name: "b", notWorseThanNative: true, overlaps: 0 }],
    });
    expect(bad.passes).toBe(false);
    expect(bad.failures).toHaveLength(6);
    expect(reportMeetsGate({ ...good(), fixtures: [] }).passes).toBe(false);
  });
});

describe("the lazy loader", () => {
  it("loads elkjs only when asked, once, and the layout it gives works", async () => {
    const elk = await loadElk();
    expect(await loadElk()).toBe(elk);
    const result = (await elk.layout({ id: "root", layoutOptions: { "elk.algorithm": "layered" }, children: [{ id: "a", width: 40, height: 30 }, { id: "b", width: 40, height: 30 }], edges: [{ id: "e", sources: ["a"], targets: ["b"] }] })) as { children: Array<{ id: string; x: number; y: number }> };
    expect(result.children.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(result.children.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
  });
});
