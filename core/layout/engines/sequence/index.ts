import { defineNaturalEngine } from "../../kit/natural";
import type { LayoutGraph } from "../../types";

type P = { gap: number };

const LABEL_CHAR = 7;

/** Participants in order of first appearance in the messages (the declaration order of the edges), then any that send nothing. */
const firstAppearance = (graph: LayoutGraph): string[] => {
  const seen: string[] = [];
  for (const e of graph.edges) for (const id of [e.from, e.to]) if (!seen.includes(id)) seen.push(id);
  for (const n of graph.nodes) if (!seen.includes(n.id)) seen.push(n.id);
  return seen.filter((id) => graph.nodes.some((n) => n.id === id));
};

/** Greedy insertion by message count: the participant that talks most to the ones already placed goes next to them, so messages are short. */
const closestTalkers = (graph: LayoutGraph): string[] => {
  const weight = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const e of graph.edges) if (e.from !== e.to) weight.set(key(e.from, e.to), (weight.get(key(e.from, e.to)) ?? 0) + 1);
  const span = (order: string[]) => {
    let total = 0;
    for (let i = 0; i < order.length; i += 1) for (let j = i + 1; j < order.length; j += 1) total += (weight.get(key(order[i], order[j])) ?? 0) * (j - i);
    return total;
  };
  const base = firstAppearance(graph);
  // Up to seven participants the best order is found exhaustively (ties keep declaration order); more start from the declaration order and improve by swaps.
  if (base.length <= 7) {
    let best = { order: base, cost: span(base) };
    const permute = (rest: string[], chosen: string[]) => {
      if (rest.length === 0) {
        const cost = span(chosen);
        if (cost < best.cost) best = { order: chosen, cost };
        return;
      }
      rest.forEach((id, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, id]));
    };
    permute(base, []);
    return best.order;
  }
  const order = [...base];
  for (let pass = 0; pass < 6; pass += 1) {
    let improved = false;
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const before = span(order);
        [order[i], order[j]] = [order[j], order[i]];
        if (span(order) < before) improved = true;
        else [order[i], order[j]] = [order[j], order[i]];
      }
    }
    if (!improved) break;
  }
  return order;
};

/** One row of participants. A gap is wide enough for the longest message label between neighbours. */
const row = (graph: LayoutGraph, order: string[], gap: number) => {
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, { x: number; y: number }>();
  let x = 0;
  order.forEach((id, i) => {
    if (i > 0) {
      const prev = order[i - 1];
      const labels = graph.edges.filter((e) => (e.from === prev && e.to === id) || (e.from === id && e.to === prev)).map((e) => (e.label ?? "").length * LABEL_CHAR);
      x += Math.max(gap, ...labels, 0) + 40;
    }
    out.set(id, { x, y: 0 });
    x += node.get(id)!.width;
  });
  return out;
};

/**
 * Sequence diagrams: participants in one row, in order of first message (`participants`) or arranged so the
 * participants that talk most are neighbours (`closest`). Time runs down the page from the messages' own order.
 */
export const sequenceEngine = defineNaturalEngine<P>({
  id: "sequence",
  family: "sequence",
  label: "Sequence",
  algorithms: [
    { id: "participants", label: "In order of first message", description: "Participants left to right as they first appear.", defaults: { gap: 40 }, backend: "native" },
    { id: "closest", label: "Closest talkers together", description: "Participants that exchange the most messages are neighbours.", defaults: { gap: 40 }, backend: "native" },
  ],
  natural: {
    participants: (graph, p) => row(graph, firstAppearance(graph), p.gap),
    closest: (graph, p) => row(graph, closestTalkers(graph), p.gap),
  },
});
