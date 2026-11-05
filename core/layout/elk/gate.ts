/**
 * ELK-backed algorithms are offered only after each one passes this gate on its family's golden set. The list below
 * is the single switch: an entry is `enabled: false` until a benchmark report that meets `GATE` is committed and its
 * path recorded here. `gate.test.ts` fails if an entry is enabled without such a report, so enabling is a reviewed
 * change to this file, never a runtime flag. Enabling the first entry also moves elkjs from devDependencies to dependencies
 * (it is a dev dependency today, used by the benchmark, and nothing in the app calls the loader).
 */
export interface ElkGateEntry {
  /** The engine that would offer it, and the ELK algorithm behind it. */
  engine: string;
  algorithm: string;
  enabled: boolean;
  /** Path of the committed benchmark report that justifies `enabled`. */
  report?: string;
}

export const ELK_GATE: readonly ElkGateEntry[] = [
  { engine: "er", algorithm: "stress", enabled: false },
  { engine: "mind-map", algorithm: "radial", enabled: false },
  { engine: "mind-map", algorithm: "mrtree", enabled: false },
  { engine: "uml", algorithm: "layered", enabled: false },
  { engine: "bpmn", algorithm: "layered", enabled: false },
];

/** What a report must show, per algorithm, on its family's golden set. */
export const GATE = {
  /** Share of fixtures on which the quality is not worse than the native baseline (within `qualityTolerance`). */
  minFixtureShare: 0.9,
  /** How much worse than the baseline on a family metric still counts as equal (a fraction). */
  qualityTolerance: 0.1,
  maxOverlaps: 0,
  /** p95 layout time for 300 nodes, in the worker. */
  p95Ms: 1500,
} as const;

export interface GateReport {
  engine: string;
  algorithm: string;
  elkVersion: string;
  /** The licence review of the elkjs version in use was done (EPL-2.0). */
  licenceReviewed: boolean;
  fixtures: Array<{ name: string; notWorseThanNative: boolean; overlaps: number }>;
  /** The same seed gave the same positions twice. */
  deterministic: boolean;
  /** `enforceFixed` left every fixed element byte-identical, locality within budget, idempotent. */
  incrementalContractHolds: boolean;
  p95Ms300: number;
}

export interface GateResult {
  passes: boolean;
  failures: string[];
}

export const reportMeetsGate = (report: GateReport): GateResult => {
  const failures: string[] = [];
  const share = report.fixtures.length === 0 ? 0 : report.fixtures.filter((f) => f.notWorseThanNative).length / report.fixtures.length;
  if (share < GATE.minFixtureShare) failures.push(`quality is not worse than the native baseline on ${Math.round(share * 100)}% of fixtures; ${GATE.minFixtureShare * 100}% needed`);
  const overlaps = report.fixtures.reduce((sum, f) => sum + f.overlaps, 0);
  if (overlaps > GATE.maxOverlaps) failures.push(`${overlaps} node overlaps`);
  if (!report.deterministic) failures.push("not deterministic for the same seed");
  if (!report.incrementalContractHolds) failures.push("the incremental contract (fixed elements, locality, idempotence) does not hold");
  if (report.p95Ms300 > GATE.p95Ms) failures.push(`p95 ${report.p95Ms300} ms for 300 nodes; ${GATE.p95Ms} ms allowed`);
  if (!report.licenceReviewed) failures.push("the elkjs licence (EPL-2.0) has not been reviewed");
  return { passes: failures.length === 0, failures };
};

/** Whether an ELK algorithm may be offered: only when the gate lists it as enabled. */
export const elkAlgorithmEnabled = (engine: string, algorithm: string): boolean => ELK_GATE.some((e) => e.engine === engine && e.algorithm === algorithm && e.enabled);
