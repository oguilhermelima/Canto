import { DomainError } from "@canto/core/domain/shared/errors";

export type UserId = string & { readonly __brand: "UserId" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidUserIdError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor(raw: string) {
    super(`Invalid user id: ${raw}`);
  }
}

/**
 * Validate a string at the brand boundary and return it as a `UserId`. The
 * single `as UserId` here is the brand cast — the regex is the runtime
 * guarantee the type system relies on.
 */
export function parseUserId(raw: string): UserId {
  if (!UUID_RE.test(raw)) throw new InvalidUserIdError(raw);
  return raw as UserId;
}

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
