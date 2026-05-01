import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import {
  findOrCreateUniqueListSlug,
  syncSingleListMembership,
  toTraktListBody,
} from "@canto/core/domain/trakt/use-cases/shared";
import type {
  SyncContext,
  SyncListMembershipDeps,
} from "@canto/core/domain/trakt/use-cases/shared";

export interface SyncCustomListsDeps extends SyncListMembershipDeps {
  traktApi: TraktApiPort;
  trakt: TraktRepositoryPort;
  lists: ListsRepositoryPort;
}

export async function syncCustomLists(
  ctx: SyncContext,
  deps: SyncCustomListsDeps,
): Promise<void> {
  const remoteLists = await deps.traktApi.listPersonalLists(
    ctx.accessToken,
    ctx.profileId,
  );
  const links = await deps.trakt.findListLinksByConnection(ctx.connectionId);
  const linksByRemoteId = new Map(
    links.map((link) => [link.traktListId, link]),
  );

  let localCustomLists = await deps.lists.findUserCustomLists(ctx.userId);
  const localById = new Map<string, (typeof localCustomLists)[number]>(
    localCustomLists.map((row) => [row.id, row]),
  );

  // Lists awaiting Trakt deletion via the worker. We must not re-import their
  // remote mirror, push items into them, or fight the worker for the remote
  // delete — the trakt-list-delete worker owns those rows until it finishes.
  const tombstonedIds = new Set(
    await deps.lists.findUserTombstonedListIds(ctx.userId),
  );

  const remoteIds = new Set(remoteLists.map((row) => row.ids.trakt));

  if (!ctx.initialSync) {
    for (const link of links) {
      if (!remoteIds.has(link.traktListId)) {
        if (localById.has(link.localListId)) {
          await deps.lists.hardDelete(link.localListId);
        }
        await deps.trakt.deleteListLinkById(link.id);
      }
    }

    for (const link of links) {
      if (localById.has(link.localListId)) continue;
      // Tombstoned local — the trakt-list-delete worker will issue the remote
      // delete (and may already be retrying). Skip to avoid double-deletion.
      if (tombstonedIds.has(link.localListId)) continue;
      try {
        await deps.traktApi.deleteList(ctx.accessToken, link.traktListId);
      } catch (err) {
        deps.logger.warn(
          `[trakt-sync] Failed to delete remote Trakt list ${link.traktListId}`,
          { err: err instanceof Error ? err.message : String(err) },
        );
      }
      await deps.trakt.deleteListLinkById(link.id);
    }

    localCustomLists = await deps.lists.findUserCustomLists(ctx.userId);
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
        deps.lists,
        ctx.userId,
        remote.ids.slug,
      );
      const created = await deps.lists.create({
        userId: ctx.userId,
        name: remote.name,
        slug,
        description: remote.description ?? undefined,
        type: "custom",
        visibility: "private",
      });
      localListId = created.id;
    }

    await deps.trakt.upsertListLink({
      userConnectionId: ctx.connectionId,
      traktListId: remote.ids.trakt,
      traktListSlug: remote.ids.slug,
      localListId,
      remoteUpdatedAt: new Date(remote.updated_at),
      lastSyncedAt: ctx.now,
    });
  }

  const refreshedLinks = await deps.trakt.findListLinksByConnection(
    ctx.connectionId,
  );
  const refreshedByLocalId = new Map<string, (typeof refreshedLinks)[number]>(
    refreshedLinks.map((link) => [link.localListId, link]),
  );

  for (const localCustom of localCustomLists) {
    if (refreshedByLocalId.has(localCustom.id)) continue;

    const remoteCreated = await deps.traktApi.createList(ctx.accessToken, {
      name: localCustom.name,
      description: localCustom.description,
      privacy: localCustom.visibility === "public" ? "public" : "private",
    });
    await deps.trakt.upsertListLink({
      userConnectionId: ctx.connectionId,
      traktListId: remoteCreated.ids.trakt,
      traktListSlug: remoteCreated.ids.slug,
      localListId: localCustom.id,
      remoteUpdatedAt: new Date(remoteCreated.updated_at),
      lastSyncedAt: ctx.now,
    });
  }

  const finalLinks = await deps.trakt.findListLinksByConnection(
    ctx.connectionId,
  );
  for (const linkRow of finalLinks) {
    if (tombstonedIds.has(linkRow.localListId)) continue;
    const remoteItems = await deps.traktApi.listListItems(
      ctx.accessToken,
      linkRow.traktListId,
      ctx.profileId,
    );

    await syncSingleListMembership(
      ctx,
      deps,
      linkRow.localListId,
      remoteItems,
      (refs) =>
        deps.traktApi.addItemsToList(
          ctx.accessToken,
          linkRow.traktListId,
          toTraktListBody(refs),
        ),
      (refs) =>
        deps.traktApi.removeItemsFromList(
          ctx.accessToken,
          linkRow.traktListId,
          toTraktListBody(refs),
        ),
    );

    await deps.trakt.upsertListLink({
      userConnectionId: ctx.connectionId,
      traktListId: linkRow.traktListId,
      traktListSlug: linkRow.traktListSlug,
      localListId: linkRow.localListId,
      remoteUpdatedAt: linkRow.remoteUpdatedAt,
      lastSyncedAt: ctx.now,
    });
  }
}
