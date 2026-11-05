import { layeredNatural, longestPathLayers } from "../../kit/layered";
import { defineNaturalEngine } from "../../kit/natural";
import type { LayoutGraph } from "../../types";

type P = { gap: number };

/** Lanes (pools, groups) as horizontal bands, steps ordered left to right by flow; a step stays in its lane. */
const swimlane = (graph: LayoutGraph, gap: number) => {
  const laneOf = new Map<string, number>();
  graph.containers.forEach((c, i) => c.members.forEach((m) => !laneOf.has(m) && laneOf.set(m, i)));
  const lanes = graph.containers.length + 1; // the last lane holds nodes that are in none
  const lane = (id: string) => laneOf.get(id) ?? lanes - 1;
  const layers = longestPathLayers(graph.nodes.map((n) => n.id), graph.edges);
  const layerCount = Math.max(0, ...layers.values()) + 1;
  const colWidth = Array.from({ length: layerCount }, (_, l) => Math.max(0, ...graph.nodes.filter((n) => layers.get(n.id) === l).map((n) => n.width)));
  const colX: number[] = [];
  colWidth.reduce((x, w, l) => ((colX[l] = x), x + w + gap), 0);
  // Within a lane, steps that share a layer stack; a lane is as tall as its tallest stack.
  const stacks = new Map<string, string[]>();
  for (const n of graph.nodes) {
    const key = `${lane(n.id)}:${layers.get(n.id)}`;
    stacks.set(key, [...(stacks.get(key) ?? []), n.id]);
  }
  const size = new Map(graph.nodes.map((n) => [n.id, n]));
  const stackHeight = (ids: string[]) => ids.reduce((s, id) => s + size.get(id)!.height, 0) + gap * (ids.length - 1);
  const laneHeight = Array.from({ length: lanes }, (_, i) => Math.max(0, ...[...stacks].filter(([k]) => k.startsWith(`${i}:`)).map(([, ids]) => stackHeight(ids))));
  const laneY: number[] = [];
  laneHeight.reduce((y, h, i) => ((laneY[i] = y), y + h + gap * 1.5), 0);
  const out = new Map<string, { x: number; y: number }>();
  for (const [key, ids] of stacks) {
    const [l, layer] = key.split(":").map(Number);
    let y = laneY[l] + (laneHeight[l] - stackHeight(ids)) / 2;
    for (const id of ids) {
      out.set(id, { x: colX[layer] + (colWidth[layer] - size.get(id)!.width) / 2, y });
      y += size.get(id)!.height + gap;
    }
  }
  return out;
};

/** BPMN and flowcharts: layered by flow, vertical or horizontal, or in swimlanes. */
export const bpmnEngine = defineNaturalEngine<P>({
  id: "bpmn",
  family: "flowchart",
  label: "BPMN / flowchart",
  algorithms: [
    { id: "vertical", label: "Top to bottom", description: "Steps run down the page.", defaults: { gap: 60 }, backend: "native" },
    { id: "horizontal", label: "Left to right", description: "Steps run across the page.", defaults: { gap: 60 }, backend: "native" },
    { id: "swimlane", label: "Swimlanes", description: "Groups become lanes; steps run left to right inside their lane.", defaults: { gap: 50 }, backend: "native" },
  ],
  natural: {
    vertical: (graph, p) => layeredNatural(graph, { direction: "down", gapInLayer: p.gap, gapBetweenLayers: p.gap + 30 }),
    horizontal: (graph, p) => layeredNatural(graph, { direction: "right", gapInLayer: p.gap, gapBetweenLayers: p.gap + 50 }),
    swimlane: (graph, p) => swimlane(graph, p.gap),
  },
});
