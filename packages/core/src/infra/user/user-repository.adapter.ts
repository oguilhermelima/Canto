import type { Database } from "@canto/db/client";
import type { UserRepositoryPort } from "@canto/core/domain/user/ports/user-repository.port";
import {
  findDownloadPreferences,
  upsertDownloadPreference,
} from "@canto/core/infra/user/preferences-repository";
import {
  findAllUsers,
  findPublicUserProfile,
  getUserPreferences,
  getUserProfile,
  setUserPreferences,
  updateUserProfile,
} from "@canto/core/infra/user/user-repository";
import {
  toPreferences,
  toProfileMetadata,
  toPublicProfile,
  toSummary,
} from "@canto/core/infra/user/user.mapper";

export function makeUserRepository(db: Database): UserRepositoryPort {
  return {
    findAll: async () => {
      const rows = await findAllUsers(db);
      return rows.map(toSummary);
    },
    findPreferences: async (userId) => {
      const row = await getUserPreferences(db, userId);
      return toPreferences(row);
    },
    setPreferences: async (userId, input) => {
      await setUserPreferences(db, userId, input);
    },
    findProfileMetadata: async (userId) => {
      const row = await getUserProfile(db, userId);
      return toProfileMetadata(row);
    },
    findPublicProfile: async (userId) => {
      const row = await findPublicUserProfile(db, userId);
      return row ? toPublicProfile(row) : null;
    },
    updateProfile: async (userId, input) => {
      await updateUserProfile(db, userId, input);
    },
    findDownloadPreferences: async (userId) => {
      return findDownloadPreferences(db, userId);
    },
    upsertDownloadPreference: async (userId, key, value) => {
      await upsertDownloadPreference(db, userId, key, value);
    },
  };
}
