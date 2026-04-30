import type { Database } from "@canto/db/client";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import {
  attachRemoteIdToHistorySync,
  createTraktHistorySync,
  deleteTraktListLinksNotIn,
  findTraktHistorySyncByLocalIds,
  findTraktHistorySyncByRemoteIds,
  findTraktListLinkByLocalListId,
  findTraktListLinksByConnection,
  findTraktSyncStateByConnection,
  setTraktSectionWatermark,
  upsertTraktListLink,
  upsertTraktSyncState,
} from "@canto/core/infra/trakt/trakt-sync-repository";
import {
  toDomain as historyToDomain,
} from "@canto/core/infra/trakt/trakt-history-sync.mapper";
import {
  toDomain as linkToDomain,
} from "@canto/core/infra/trakt/trakt-list-link.mapper";
import {
  toDomain as stateToDomain,
} from "@canto/core/infra/trakt/trakt-sync-state.mapper";
import { traktListLink } from "@canto/db/schema";
import { eq } from "drizzle-orm";

export function makeTraktRepository(db: Database): TraktRepositoryPort {
  return {
    // ── Trakt List Link ──
    findListLinksByConnection: async (userConnectionId) => {
      const rows = await findTraktListLinksByConnection(db, userConnectionId);
      return rows.map(linkToDomain);
    },
    findListLinkByLocalListId: async (localListId) => {
      const row = await findTraktListLinkByLocalListId(db, localListId);
      return row ? linkToDomain(row) : null;
    },
    upsertListLink: async (input) => {
      const row = await upsertTraktListLink(db, {
        userConnectionId: input.userConnectionId,
        traktListId: input.traktListId,
        traktListSlug: input.traktListSlug,
        localListId: input.localListId,
        remoteUpdatedAt: input.remoteUpdatedAt ?? null,
        lastSyncedAt: input.lastSyncedAt,
      });
      return linkToDomain(row);
    },
    deleteListLinkById: async (id) => {
      await db.delete(traktListLink).where(eq(traktListLink.id, id));
    },
    deleteListLinksNotIn: async (userConnectionId, traktListIds) => {
      return deleteTraktListLinksNotIn(db, userConnectionId, traktListIds);
    },

    // ── Trakt Sync State ──
    findSyncStateByConnection: async (userConnectionId) => {
      const row = await findTraktSyncStateByConnection(db, userConnectionId);
      return row ? stateToDomain(row) : null;
    },
    upsertSyncState: async (userConnectionId, patch) => {
      const row = await upsertTraktSyncState(db, userConnectionId, patch);
      return stateToDomain(row);
    },
    setSectionWatermark: async (userConnectionId, section, remoteAt) => {
      await setTraktSectionWatermark(db, userConnectionId, section, remoteAt);
    },

    // ── Trakt History Sync ──
    findHistorySyncByRemoteIds: async (userConnectionId, remoteHistoryIds) => {
      const rows = await findTraktHistorySyncByRemoteIds(
        db,
        userConnectionId,
        remoteHistoryIds,
      );
      return rows.map(historyToDomain);
    },
    findHistorySyncByLocalIds: async (userConnectionId, localHistoryIds) => {
      const rows = await findTraktHistorySyncByLocalIds(
        db,
        userConnectionId,
        localHistoryIds,
      );
      return rows.map(historyToDomain);
    },
    createHistorySync: async (input) => {
      const row = await createTraktHistorySync(db, {
        userConnectionId: input.userConnectionId,
        localHistoryId: input.localHistoryId ?? null,
        remoteHistoryId: input.remoteHistoryId ?? null,
        syncedDirection: input.syncedDirection,
      });
      return row ? historyToDomain(row) : null;
    },
    attachRemoteIdToHistorySync: async (
      userConnectionId,
      localHistoryId,
      remoteHistoryId,
    ) => {
      await attachRemoteIdToHistorySync(
        db,
        userConnectionId,
        localHistoryId,
        remoteHistoryId,
      );
    },
  };
}
