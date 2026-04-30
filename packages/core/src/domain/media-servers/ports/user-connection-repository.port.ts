import type {
  ConnectionKind,
  NewUserConnection,
  UpdateUserConnectionInput,
  UserConnection,
} from "@canto/core/domain/media-servers/types/user-connection";

/**
 * `UserConnectionRepositoryPort` covers CRUD on the `user_connection` table —
 * the per-user binding between a Canto user and a remote media-server
 * identity. The 8 methods cover every read/write the media-servers and trakt
 * contexts need; richer joins (e.g. trakt_list_link → user_connection) live
 * in their respective context repositories.
 */
export interface UserConnectionRepositoryPort {
  /** Every enabled connection across providers — used by the reverse-sync
   *  worker to walk all per-user Plex/Jellyfin scans. */
  findAllEnabled(): Promise<UserConnection[]>;
  findById(id: string): Promise<UserConnection | null>;
  findByUserId(userId: string): Promise<UserConnection[]>;
  findByProvider(
    userId: string,
    provider: ConnectionKind,
  ): Promise<UserConnection | null>;
  /** Trakt-only: enabled rows with non-null token, used by the periodic
   *  Trakt sync worker. */
  findEnabledTraktConnections(): Promise<UserConnection[]>;
  create(input: NewUserConnection): Promise<UserConnection>;
  update(
    id: string,
    input: UpdateUserConnectionInput,
  ): Promise<UserConnection | undefined>;
  delete(id: string): Promise<UserConnection | undefined>;
  markStale(id: string, reason: string): Promise<void>;
  /** Idempotent — only updates `updatedAt` when there's actually a stale
   *  reason to clear, so a healthy connection doesn't churn on every sync. */
  clearStale(id: string): Promise<void>;
}
