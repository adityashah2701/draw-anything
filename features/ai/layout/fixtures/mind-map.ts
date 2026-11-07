import { fixtureDocument } from "./base";

/** One root, six branches, three leaves each: 25 nodes, no edge labels, mixed label lengths. */
const branches: Array<{ id: string; label: string; leaves: string[] }> = [
  { id: "proc", label: "Processes", leaves: ["Process control block", "Context switch overhead", "States: new, ready, running, waiting"] },
  { id: "sched", label: "Scheduling algorithms", leaves: ["First come, first served", "Shortest job first", "Round robin with a time quantum"] },
  { id: "metrics", label: "Metrics", leaves: ["Throughput", "Turnaround time", "Waiting and response time"] },
  { id: "prio", label: "Priorities", leaves: ["Static vs dynamic", "Starvation and aging", "Priority inversion"] },
  { id: "mlfq", label: "Multilevel feedback queues", leaves: ["Queue promotion rules", "Per-queue quantum", "I/O-bound favouring"] },
  { id: "rt", label: "Real-time", leaves: ["Rate monotonic", "Earliest deadline first", "Hard and soft deadlines"] },
];

export const mindMapFixture = fixtureDocument({
  id: "mind-map",
  diagramType: "mind-map",
  prompt: "Mind map explaining operating-system process scheduling",
  direction: "radial",
  strategy: "radial",
  nodes: [
    { id: "root", label: "Operating-system process scheduling", kind: "generic" },
    ...branches.flatMap((b) => [
      { id: b.id, label: b.label, kind: "generic" as const },
      ...b.leaves.map((leaf, i) => ({ id: `${b.id}-${i}`, label: leaf, kind: "generic" as const })),
    ]),
  ],
  edges: branches.flatMap((b) => [
    { from: "root", to: b.id },
    ...b.leaves.map((_, i) => ({ from: b.id, to: `${b.id}-${i}` })),
  ]),
});
