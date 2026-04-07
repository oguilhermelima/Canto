export interface RecsFilters {
  genreIds?: number[];
  genreMode?: "and" | "or";
  language?: string;
  scoreMin?: number;
  yearMin?: string;
  yearMax?: string;
  runtimeMin?: number;
  runtimeMax?: number;
  certification?: string;
  status?: string;
  sortBy?: string;
  watchProviders?: string; // comma-separated provider IDs like "8,337"
  watchRegion?: string;    // region code like "BR"
}
