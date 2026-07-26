import { AIDiagramDocumentV1 } from "@/features/ai/types";

export const detectPotentialCollisions = (document: AIDiagramDocumentV1) => {
  const buckets = new Map<string, number>();
  document.nodes.forEach((node, index) => {
    const bucket = `${node.layer ?? "application"}:${node.column ?? index}`;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });

  const collisions = Array.from(buckets.entries())
    .filter(([, count]) => count > 1)
    .map(([bucket, count]) => ({ bucket, count }));

  return {
    collisionCount: collisions.length,
    collisions,
  };
};
