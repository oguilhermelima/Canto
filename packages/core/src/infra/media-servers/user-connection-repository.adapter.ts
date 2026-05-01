import type { Database } from "@canto/db/client";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import {
  clearUserConnectionStale,
  createUserConnection,
  deleteUserConnection,
  findAllUserConnections,
  findEnabledTraktConnections,
  findUserConnectionById,
  findUserConnectionByProvider,
  findUserConnectionsByUserId,
  markUserConnectionStale,
  updateUserConnection,
} from "@canto/core/infra/media-servers/user-connection-repository";
import {
  toDomain,
  toRow,
  toUpdateRow,
} from "@canto/core/infra/media-servers/user-connection.mapper";

export function makeUserConnectionRepository(
  db: Database,
): UserConnectionRepositoryPort {
  return {
    findAllEnabled: async () => {
      const rows = await findAllUserConnections(db);
      return rows.map(toDomain);
    },
    findById: async (id) => {
      const row = await findUserConnectionById(db, id);
      return row ? toDomain(row) : null;
    },
    findByUserId: async (userId) => {
      const rows = await findUserConnectionsByUserId(db, userId);
      return rows.map(toDomain);
    },
    findByProvider: async (userId, provider) => {
      const row = await findUserConnectionByProvider(db, userId, provider);
      return row ? toDomain(row) : null;
    },
    findEnabledTraktConnections: async (opts) => {
      const rows = await findEnabledTraktConnections(db, opts);
      return rows.map(toDomain);
    },
    create: async (input) => {
      const row = await createUserConnection(db, toRow(input));
      if (!row) {
        throw new Error("createUserConnection returned no row");
      }
      return toDomain(row);
    },
    update: async (id, input) => {
      const row = await updateUserConnection(db, id, toUpdateRow(input));
      return row ? toDomain(row) : undefined;
    },
    delete: async (id) => {
      const row = await deleteUserConnection(db, id);
      return row ? toDomain(row) : undefined;
    },
    markStale: async (id, reason) => {
      await markUserConnectionStale(db, id, reason);
    },
    clearStale: async (id) => {
      await clearUserConnectionStale(db, id);
    },
  };
}
