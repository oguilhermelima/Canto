import { and, asc, eq, isNull, isNotNull } from "drizzle-orm";
import { list, traktListLink } from "@canto/db/schema";
import { createList } from "../../../infrastructure/repositories";
import {
  findTraktListLinksByConnection,
  upsertTraktListLink,
} from "../../../infrastructure/repositories/trakt-sync-repository";
import {
  addItemsToTraktList,
  createTraktList,
  deleteTraktList,
  listTraktListItems,
  listTraktPersonalLists,
  removeItemsFromTraktList,
} from "../../../infrastructure/adapters/trakt";
import {
  findOrCreateUniqueListSlug,
  syncSingleListMembership,
  toTraktListBody,
  type SyncContext,
} from "./shared";

export async function syncCustomLists(ctx: SyncContext): Promise<void> {
  const remoteLists = await listTraktPersonalLists(
    ctx.accessToken,
    ctx.profileId,
  );
  const links = await findTraktListLinksByConnection(ctx.db, ctx.connectionId);
  const linksByRemoteId = new Map(
    links.map((link) => [link.traktListId, link]),
  );

  let localCustomLists = await ctx.db.query.list.findMany({
    where: and(eq(list.userId, ctx.userId), eq(list.type, "custom"), isNull(list.deletedAt)),
    orderBy: [asc(list.createdAt)],
  });
  const localById = new Map(localCustomLists.map((row) => [row.id, row]));

  // Lists awaiting Trakt deletion via the worker. We must not re-import their
  // remote mirror, push items into them, or fight the worker for the remote
  // delete — the trakt-list-delete worker owns those rows until it finishes.
  const tombstonedRows = await ctx.db
    .select({ id: list.id })
    .from(list)
    .where(and(eq(list.userId, ctx.userId), isNotNull(list.deletedAt)));
  const tombstonedIds = new Set(tombstonedRows.map((r) => r.id));

  const remoteIds = new Set(remoteLists.map((row) => row.ids.trakt));

  if (!ctx.initialSync) {
    for (const link of links) {
      if (!remoteIds.has(link.traktListId)) {
        if (localById.has(link.localListId)) {
          await ctx.db
            .delete(list)
            .where(
              and(
                eq(list.id, link.localListId),
                eq(list.userId, ctx.userId),
                eq(list.type, "custom"),
              ),
            );
        }
        await ctx.db
          .delete(traktListLink)
          .where(eq(traktListLink.id, link.id));
      }
    }

    for (const link of links) {
      if (localById.has(link.localListId)) continue;
      // Tombstoned local — the trakt-list-delete worker will issue the remote
      // delete (and may already be retrying). Skip to avoid double-deletion.
      if (tombstonedIds.has(link.localListId)) continue;
      try {
        await deleteTraktList(ctx.accessToken, link.traktListId);
      } catch (err) {
        console.warn(
          `[trakt-sync] Failed to delete remote Trakt list ${link.traktListId}:`,
          err instanceof Error ? err.message : err,
        );
      }
      await ctx.db
        .delete(traktListLink)
        .where(eq(traktListLink.id, link.id));
    }

    localCustomLists = await ctx.db.query.list.findMany({
      where: and(eq(list.userId, ctx.userId), eq(list.type, "custom"), isNull(list.deletedAt)),
      orderBy: [asc(list.createdAt)],
    });
  }

  for (const remote of remoteLists) {
    const linked = linksByRemoteId.get(remote.ids.trakt);
    // The local mirror is awaiting deletion via the worker — leave the remote
    // alone here. The worker will issue the Trakt DELETE; until then we don't
    // refresh links or items for this pair.
    if (linked && tombstonedIds.has(linked.localListId)) continue;
    let localListId = linked?.localListId;

    if (!localListId) {
      const slug = await findOrCreateUniqueListSlug(
        ctx.db,
        ctx.userId,
        remote.ids.slug,
      );
      const created = await createList(ctx.db, {
        userId: ctx.userId,
        name: remote.name,
        slug,
        description: remote.description ?? undefined,
        type: "custom",
        visibility: "private",
      });
      localListId = created.id;
    }

    await upsertTraktListLink(ctx.db, {
      userConnectionId: ctx.connectionId,
      traktListId: remote.ids.trakt,
      traktListSlug: remote.ids.slug,
      localListId,
      remoteUpdatedAt: new Date(remote.updated_at),
      lastSyncedAt: ctx.now,
    });
  }

  const refreshedLinks = await findTraktListLinksByConnection(
    ctx.db,
    ctx.connectionId,
  );
  const refreshedByLocalId = new Map(
    refreshedLinks.map((link) => [link.localListId, link]),
  );

  for (const localCustom of localCustomLists) {
    if (refreshedByLocalId.has(localCustom.id)) continue;

    const remoteCreated = await createTraktList(ctx.accessToken, {
      name: localCustom.name,
      description: localCustom.description,
      privacy: localCustom.visibility === "public" ? "public" : "private",
    });
    await upsertTraktListLink(ctx.db, {
      userConnectionId: ctx.connectionId,
      traktListId: remoteCreated.ids.trakt,
      traktListSlug: remoteCreated.ids.slug,
      localListId: localCustom.id,
      remoteUpdatedAt: new Date(remoteCreated.updated_at),
      lastSyncedAt: ctx.now,
    });
  }

  const finalLinks = await findTraktListLinksByConnection(
    ctx.db,
    ctx.connectionId,
  );
  for (const linkRow of finalLinks) {
    if (tombstonedIds.has(linkRow.localListId)) continue;
    const remoteItems = await listTraktListItems(
      ctx.accessToken,
      linkRow.traktListId,
      ctx.profileId,
    );

    await syncSingleListMembership(
      ctx,
      linkRow.localListId,
      remoteItems,
      (refs) =>
        addItemsToTraktList(
          ctx.accessToken,
          linkRow.traktListId,
          toTraktListBody(refs),
        ),
      (refs) =>
        removeItemsFromTraktList(
          ctx.accessToken,
          linkRow.traktListId,
          toTraktListBody(refs),
        ),
    );

    await upsertTraktListLink(ctx.db, {
      userConnectionId: ctx.connectionId,
      traktListId: linkRow.traktListId,
      traktListSlug: linkRow.traktListSlug,
      localListId: linkRow.localListId,
      remoteUpdatedAt: linkRow.remoteUpdatedAt,
      lastSyncedAt: ctx.now,
    });
  }
}
