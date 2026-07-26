export const semanticSearchMemories = (
  memories: Array<{ id: string; summary: string; tags: string[] }>,
  tags: string[],
) => {
  const wanted = new Set(tags);
  return memories.filter(
    (memory) =>
      memory.tags.some((tag) => wanted.has(tag)) ||
      tags.some((tag) => memory.summary.toLowerCase().includes(tag)),
  );
};
