/**
 * Read-side port for the user-preference fields that drive locale-aware
 * pipelines (translations, region-aware feeds, watch-provider lookups).
 * Kept narrow so use cases that only need a language code can declare a
 * single-method dep instead of carrying the full `UserRepositoryPort`.
 */
export interface UserPreferencesPort {
  /** User's preferred language code (BCP-47). `null` when the user row
   *  doesn't exist or has no language set. */
  findUserLanguage(userId: string): Promise<string | null>;

  /** User's preferred language + watch region together. `null` when the
   *  user row doesn't exist; either field may be `null` when unset. */
  findUserWatchPreferences(userId: string): Promise<{
    language: string | null;
    watchRegion: string | null;
  } | null>;

  /** Distinct non-null language codes across all active users. Drives the
   *  eager-translation pipeline so we only fetch languages someone uses. */
  listActiveUserLanguages(): Promise<string[]>;
}
