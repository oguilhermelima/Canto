export type UserId = string & { readonly __brand: "UserId" };

export type UserRole = "admin" | "user";

/**
 * BCP-47 locale code matching `supported_language.code` (en-US, pt-BR, ...).
 * Kept as a plain string because the seed list has 18 entries and grows; a
 * union would force domain code to ignore unknown values that the DB still
 * accepts.
 */
export type UserLanguage = string;

export interface User {
  id: UserId;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: UserRole;
  language: UserLanguage;
  watchRegion: string | null;
  isPublic: boolean;
  bio: string | null;
  headerImage: string | null;
  directSearchEnabled: boolean;
  recsVersion: number;
  recsUpdatedAt: Date | null;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Projection used by the admin user list. */
export interface UserSummary {
  id: UserId;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

/** Projection used by the public profile route. */
export interface UserPublicProfile {
  id: UserId;
  name: string;
  image: string | null;
  bio: string | null;
  headerImage: string | null;
  isPublic: boolean;
  createdAt: Date;
}

/** Projection used by the user-preferences settings route. */
export interface UserPreferences {
  watchRegion: string | null;
  directSearchEnabled: boolean;
  isPublic: boolean;
}

/** Projection used by the profile-metadata settings route. */
export interface UserProfileMetadata {
  bio: string | null;
  headerImage: string | null;
}

export type UpdateUserPreferencesInput = Partial<UserPreferences>;

export type UpdateUserProfileInput = Partial<UserProfileMetadata>;
