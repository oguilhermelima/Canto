import type { user } from "@canto/db/schema";
import type {
  UserId,
  UserPreferences,
  UserProfileMetadata,
  UserPublicProfile,
  UserRole,
  UserSummary,
} from "@canto/core/domain/user/types/user";

type UserRow = typeof user.$inferSelect;

export function toSummary(
  row: Pick<UserRow, "id" | "name" | "email" | "role" | "createdAt">,
): UserSummary {
  return {
    id: row.id as UserId,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    createdAt: row.createdAt,
  };
}

export function toPublicProfile(
  row: Pick<
    UserRow,
    "id" | "name" | "image" | "bio" | "headerImage" | "isPublic" | "createdAt"
  >,
): UserPublicProfile {
  return {
    id: row.id as UserId,
    name: row.name,
    image: row.image,
    bio: row.bio,
    headerImage: row.headerImage,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
  };
}

export function toPreferences(row: {
  watchRegion: string | null;
  directSearchEnabled: boolean;
  isPublic: boolean;
}): UserPreferences {
  return {
    watchRegion: row.watchRegion,
    directSearchEnabled: row.directSearchEnabled,
    isPublic: row.isPublic,
  };
}

export function toProfileMetadata(row: {
  bio: string | null;
  headerImage: string | null;
}): UserProfileMetadata {
  return {
    bio: row.bio,
    headerImage: row.headerImage,
  };
}
