export type SortColumn = "seeders" | "peers" | "size" | "age" | "confidence";
export type SortDir = "asc" | "desc";

export const SORT_COLUMNS = [
  "confidence",
  "seeders",
  "size",
  "age",
] as const satisfies ReadonlyArray<SortColumn>;

export const SORT_LABELS: Record<(typeof SORT_COLUMNS)[number], string> = {
  confidence: "Score",
  seeders: "Seeds",
  size: "Size",
  age: "Age",
};
