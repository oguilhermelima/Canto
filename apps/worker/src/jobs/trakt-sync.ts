import { db } from "@canto/db/client";
import {
  syncAllTraktConnections,
  syncUserTraktConnections,
} from "@canto/core/domain/use-cases/trakt";

export async function handleTraktSync(): Promise<void> {
  await syncAllTraktConnections(db);
}

export async function handleTraktSyncUser(userId: string): Promise<void> {
  await syncUserTraktConnections(db, userId);
}
