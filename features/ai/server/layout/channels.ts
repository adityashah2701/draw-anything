/**
 * How much room the lanes between two rows need. A row gap that suits one connector leaves several
 * parallel ones (and their labels) pressed against each other and the nodes, so the gap widens with the
 * connectors that cross it, up to a ceiling.
 */
export const CHANNEL_LANE = 14;
export const CHANNEL_LABEL_ROOM = 22;
export const CHANNEL_EXTRA_CEILING = 84;

export const channelGap = (base: number, { crossings, labelled }: { crossings: number; labelled: boolean }): number => {
  if (crossings <= 0) return base;
  const extra = Math.max(0, crossings - 1) * CHANNEL_LANE + (labelled ? CHANNEL_LABEL_ROOM : 0);
  return base + Math.min(CHANNEL_EXTRA_CEILING, extra);
};

/**
 * The gap to leave below each layer: for every boundary between two layers, the connectors crossing it
 * (a connector that skips layers counts on each boundary it crosses). Boundaries nothing crosses are
 * left out, so the caller falls back to its base gap.
 */
export const verticalGapsByDepth = (
  edges: Array<{ from: string; to: string; labelWidth?: number }>,
  depthOf: ReadonlyMap<string, number>,
  base: number,
): Map<number, number> => {
  const crossings = new Map<number, { count: number; labelled: boolean }>();
  for (const edge of edges) {
    const a = depthOf.get(edge.from);
    const b = depthOf.get(edge.to);
    if (a === undefined || b === undefined || a === b) continue;
    for (let boundary = Math.min(a, b); boundary < Math.max(a, b); boundary += 1) {
      const entry = crossings.get(boundary) ?? { count: 0, labelled: false };
      entry.count += 1;
      entry.labelled ||= (edge.labelWidth ?? 0) > 0;
      crossings.set(boundary, entry);
    }
  }
  return new Map([...crossings].map(([boundary, { count, labelled }]) => [boundary, channelGap(base, { crossings: count, labelled })]));
};
