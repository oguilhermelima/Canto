export interface LibraryRepositoryPort {
  findUserPreferences(
    userId: string,
  ): Promise<Record<string, unknown> & { autoMergeVersions: boolean; defaultQuality: string }>;

  upsertUserPreference(userId: string, key: string, value: unknown): Promise<void>;
}
