import type { Aspect } from "@canto/core/domain/media/types/media-aspect-state";
import type { MediaEnrichmentStrategy } from "@canto/core/domain/media/enrichment/types";
import type { PlanItem } from "@canto/core/domain/media/use-cases/cadence/compute-plan";
import { EnrichmentRegistryCycleError } from "@canto/core/domain/media/errors";

/**
 * Topologically sort plan items by their strategy's `dependsOn` so that
 * earlier aspects (e.g. metadata) run before later aspects (e.g. structure,
 * translations) that read or extend the same DB rows.
 *
 * Items with the same aspect keep their original relative order — important
 * for translation scopes which are dispatched in the order the plan supplied.
 */
export function topoSortPlanItems(
  items: PlanItem[],
  registry: Record<Aspect, MediaEnrichmentStrategy>,
): PlanItem[] {
  // Order aspects by dependency depth — Kahn's algorithm with a stable tie
  // breaker. The graph is tiny (6 nodes) so simplicity beats perf.
  const aspects = Object.keys(registry) as Aspect[];
  const inDegree = new Map<Aspect, number>(aspects.map((a) => [a, 0]));
  for (const aspect of aspects) {
    for (const dep of registry[aspect].dependsOn) {
      inDegree.set(aspect, (inDegree.get(aspect) ?? 0) + 1);
      // referenced for graph completeness; cycles would surface via leftover
      // non-zero in-degrees once the queue drains.
      void dep;
    }
  }

  const ordered: Aspect[] = [];
  const queue: Aspect[] = aspects.filter((a) => (inDegree.get(a) ?? 0) === 0);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    ordered.push(next);
    for (const a of aspects) {
      if (registry[a].dependsOn.includes(next)) {
        const remaining = (inDegree.get(a) ?? 0) - 1;
        inDegree.set(a, remaining);
        if (remaining === 0) queue.push(a);
      }
    }
  }

  if (ordered.length !== aspects.length) {
    throw new EnrichmentRegistryCycleError();
  }

  const aspectRank = new Map<Aspect, number>(
    ordered.map((a, idx) => [a, idx]),
  );
  return [...items].sort((a, b) => {
    const rankDiff =
      (aspectRank.get(a.aspect) ?? 0) - (aspectRank.get(b.aspect) ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return 0;
  });
}
