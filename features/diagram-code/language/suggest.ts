const distance = (a: string, b: string, limit: number): number => {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
};

/** The closest candidate to `word` (case-insensitive), or undefined when nothing is close enough to be a typo. */
export const closest = (word: string, candidates: Iterable<string>): string | undefined => {
  const w = word.trim().toLowerCase();
  if (w === "") return undefined;
  const limit = w.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestScore = limit + 1;
  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    const score = c === w ? 0 : c.startsWith(w) && w.length >= 3 ? 1 : distance(w, c, limit);
    if (score < bestScore || (score === bestScore && best !== undefined && candidate < best)) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore <= limit ? best : undefined;
};

export const didYouMean = (word: string, candidates: Iterable<string>): string | undefined => closest(word, candidates);
