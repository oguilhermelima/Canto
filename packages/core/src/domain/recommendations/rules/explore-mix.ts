/**
 * Inject explore items into the personalized list at fixed positions to
 * break the filter bubble. The pattern is "1 explore every 5 positions
 * starting at index 3" — for pageSize 20 that means slots 3, 8, 13, 18,
 * roughly 1/5 of the page.
 *
 * `personalized` is mutated in place by replacement. We replace rather than
 * insert so the page size stays constant — the goal is fresh discovery
 * without robbing the user of slots they're paying attention to.
 */
const SLOT_INTERVAL = 5;
const FIRST_SLOT = 3;

export function exploreSlotPositions(pageSize: number): number[] {
  const slots: number[] = [];
  for (let pos = FIRST_SLOT; pos < pageSize; pos += SLOT_INTERVAL) {
    slots.push(pos);
  }
  return slots;
}

export function mixExploreSlots<T>(personalized: T[], explore: T[]): T[] {
  if (explore.length === 0) return personalized;
  const result = [...personalized];
  const positions = exploreSlotPositions(result.length);
  const limit = Math.min(positions.length, explore.length);
  for (let i = 0; i < limit; i++) {
    const pos = positions[i];
    const item = explore[i];
    if (pos === undefined || item === undefined) continue;
    result[pos] = item;
  }
  return result;
}
