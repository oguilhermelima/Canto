export interface LibraryRepositoryPort {
  findUserPreferences(
    userId: string,
  ): Promise<Record<string, unknown> & { defaultQuality: string }>;

  upsertUserPreference(userId: string, key: string, value: unknown): Promise<void>;
}
