import type { userConnection } from "@canto/db/schema";
import type {
  ConnectionKind,
  NewUserConnection,
  UpdateUserConnectionInput,
  UserConnection,
  UserConnectionId,
} from "@canto/core/domain/media-servers/types/user-connection";

type UserConnectionRow = typeof userConnection.$inferSelect;
type UserConnectionInsert = typeof userConnection.$inferInsert;

export function toDomain(row: UserConnectionRow): UserConnection {
  return {
    id: row.id as UserConnectionId,
    userId: row.userId,
    provider: row.provider as ConnectionKind,
    token: row.token,
    refreshToken: row.refreshToken,
    tokenExpiresAt: row.tokenExpiresAt,
    externalUserId: row.externalUserId,
    accessibleLibraries: row.accessibleLibraries ?? null,
    enabled: row.enabled,
    staleReason: row.staleReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewUserConnection): UserConnectionInsert {
  return {
    userId: input.userId,
    provider: input.provider,
    token: input.token ?? undefined,
    refreshToken: input.refreshToken ?? undefined,
    tokenExpiresAt: input.tokenExpiresAt ?? undefined,
    externalUserId: input.externalUserId ?? undefined,
    accessibleLibraries: input.accessibleLibraries ?? undefined,
    enabled: input.enabled,
  };
}

/** Translate the patch shape used by `update` calls into a partial Drizzle
 *  insert. Skips `undefined` so the SQL `SET` clause only touches fields the
 *  caller actually supplied. `null` is preserved (it has explicit semantics
 *  for token/refreshToken/staleReason). */
export function toUpdateRow(
  input: UpdateUserConnectionInput,
): Partial<UserConnectionInsert> {
  const out: Partial<UserConnectionInsert> = {};
  if (input.token !== undefined) out.token = input.token;
  if (input.refreshToken !== undefined) out.refreshToken = input.refreshToken;
  if (input.tokenExpiresAt !== undefined) out.tokenExpiresAt = input.tokenExpiresAt;
  if (input.externalUserId !== undefined) out.externalUserId = input.externalUserId;
  if (input.accessibleLibraries !== undefined) {
    out.accessibleLibraries = input.accessibleLibraries ?? undefined;
  }
  if (input.enabled !== undefined) out.enabled = input.enabled;
  if (input.staleReason !== undefined) out.staleReason = input.staleReason;
  return out;
}
