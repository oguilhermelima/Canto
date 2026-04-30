import type { DownloadPreferences } from "@canto/core/domain/shared/rules/scoring-rules";
import type {
  UpdateUserPreferencesInput,
  UpdateUserProfileInput,
  UserId,
  UserPreferences,
  UserProfileMetadata,
  UserPublicProfile,
  UserSummary,
} from "../types/user";

export type DownloadPreferenceKey =
  | "preferredLanguages"
  | "preferredStreamingServices";

export interface UserRepositoryPort {
  findAll(): Promise<UserSummary[]>;
  findPreferences(userId: UserId): Promise<UserPreferences>;
  setPreferences(
    userId: UserId,
    input: UpdateUserPreferencesInput,
  ): Promise<void>;
  findProfileMetadata(userId: UserId): Promise<UserProfileMetadata>;
  findPublicProfile(userId: UserId): Promise<UserPublicProfile | null>;
  updateProfile(userId: UserId, input: UpdateUserProfileInput): Promise<void>;
  findDownloadPreferences(userId: UserId): Promise<DownloadPreferences>;
  upsertDownloadPreference(
    userId: UserId,
    key: DownloadPreferenceKey,
    value: string[],
  ): Promise<void>;
}
