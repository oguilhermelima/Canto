/**
 * Maximal Marginal Relevance — re-rank a list to balance per-item relevance
 * against genre diversity. Greedy: pick the candidate that maximises
 *   λ × relevance − (1 − λ) × maxSimilarity(candidate, alreadySelected)
 * at each step.
 *
 * Similarity uses Jaccard over genreIds. Empty genres → similarity 0
 * (treated as "unknown topic", contributes no clustering pressure).
 *
 * λ = 1.0 → identical to relevance order.
 * λ = 0.0 → maximally diverse, ignores relevance.
 * λ = 0.7 (default caller value) → relevance-leaning with measurable lift
 * for users with concentrated genre seeds.
 */
export interface DiversityCandidate {
  relevance: number;
  genreIds: number[];
}

export function rankByMmr<T extends DiversityCandidate>(
  items: T[],
  lambda: number,
  topK: number,
): T[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [...items];

  const target = Math.min(topK, items.length);

  // Normalise relevance to [0, 1] so similarity (also [0, 1]) is comparable.
  let max = -Infinity;
  let min = Infinity;
  for (const item of items) {
    if (item.relevance > max) max = item.relevance;
    if (item.relevance < min) min = item.relevance;
  }
  const range = max - min || 1;
  const norm = items.map((item) => (item.relevance - min) / range);

  const genreSets = items.map((item) => new Set(item.genreIds));

  const selected: number[] = [];
  const remaining = new Set<number>();
  for (let i = 0; i < items.length; i++) remaining.add(i);

  while (selected.length < target && remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (const candidate of remaining) {
      const candGenres = genreSets[candidate];
      const candNorm = norm[candidate];
      if (candGenres === undefined || candNorm === undefined) continue;
      let maxSim = 0;
      for (const chosen of selected) {
        const chosenGenres = genreSets[chosen];
        if (chosenGenres === undefined) continue;
        const sim = jaccard(candGenres, chosenGenres);
        if (sim > maxSim) maxSim = sim;
        if (maxSim === 1) break;
      }
      const score = lambda * candNorm - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = candidate;
      }
    }
    if (bestIdx === -1) break;
    selected.push(bestIdx);
    remaining.delete(bestIdx);
  }

  return selected.flatMap((i) => {
    const item = items[i];
    return item === undefined ? [] : [item];
  });
}

function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of smaller) if (larger.has(value)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
