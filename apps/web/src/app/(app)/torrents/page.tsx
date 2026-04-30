"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { DeleteDialog } from "./_components/delete-dialog";
import type { DeleteTarget } from "./_components/delete-dialog";
import { ImportFromClientDialog } from "./_components/import-from-client-dialog";
import { ImportMagnetDialog } from "./_components/import-magnet-dialog";
import { ImportMenu } from "./_components/import-menu";
import { TorrentList } from "./_components/torrent-list";
import { TorrentTabs } from "./_components/torrent-tabs";
import { useTorrentActions } from "./_hooks/use-torrent-actions";
import { useTorrentImport } from "./_hooks/use-torrent-import";
import { filterAndCountTorrents } from "./_lib/filter-torrents";

const PAGE_SIZE = 20;

export default function DownloadsPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useDocumentTitle("Downloads");

  const utils = trpc.useUtils();
  const query = trpc.torrent.listLive.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      refetchInterval: 3000,
      initialCursor: 0,
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const offset = lastPageParam as number;
        if (offset + lastPage.items.length >= lastPage.total) return undefined;
        return offset + lastPage.items.length;
      },
    },
  );
  const torrents = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const sentinelRef = useInfiniteScroll({
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    onFetchNextPage: () => void query.fetchNextPage(),
  });

  const actions = useTorrentActions({
    torrents,
    onAfterDelete: () => setDeleteTarget(null),
  });
  const { fileInputRef, ...imp } = useTorrentImport();

  const { filtered, counts } = useMemo(
    () => filterAndCountTorrents(torrents, statusFilter),
    [torrents, statusFilter],
  );

  const importMenu = (
    <ImportMenu
      onSelectTorrent={imp.selectTorrentFile}
      onMagnet={() => imp.setMagnetDialogOpen(true)}
      onClient={() => imp.setClientImportDialogOpen(true)}
    />
  );

  return (
    <div className="w-full">
      <PageHeader
        title="Downloads"
        subtitle="Monitor and manage your active downloads."
        action={<div className="hidden items-center gap-2 md:flex">{importMenu}</div>}
      >
        <div className="mt-3 flex items-center gap-2 md:hidden">{importMenu}</div>
      </PageHeader>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".torrent,application/x-bittorrent"
        onChange={imp.handleTorrentFileChange}
      />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TorrentTabs
          value={statusFilter}
          onChange={setStatusFilter}
          counts={counts}
        />

        <TorrentList
          torrents={filtered}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => void utils.torrent.listLive.invalidate()}
          hasNextPage={query.hasNextPage}
          isFetchingNextPage={query.isFetchingNextPage}
          sentinelRef={sentinelRef}
          actions={actions}
          onDelete={(id, title) => setDeleteTarget({ id, title })}
        />

        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={actions.remove}
          isPending={actions.deletePending}
        />

        <ImportMagnetDialog
          open={imp.magnetDialogOpen}
          onOpenChange={imp.setMagnetDialogOpen}
          value={imp.magnetLink}
          onChange={imp.setMagnetLink}
          onSubmit={imp.submitMagnet}
          isPending={imp.magnetPending}
        />

        <ImportFromClientDialog
          open={imp.clientImportDialogOpen}
          onOpenChange={(open) => {
            imp.setClientImportDialogOpen(open);
            if (!open) imp.resetClientImportDialog();
          }}
          importStep={imp.importStep}
          onImportStepChange={imp.setImportStep}
          clientSearch={imp.clientSearch}
          onClientSearchChange={imp.setClientSearch}
          clientList={imp.clientList}
          clientListLoading={imp.clientListLoading}
          onSelectClient={imp.goToMediaStep}
          selectedClientTorrent={imp.selectedClientTorrent}
          importMatchMode={imp.importMatchMode}
          onImportMatchModeChange={imp.setImportMatchMode}
          tmdbSearch={imp.tmdbSearch}
          onTmdbSearchChange={imp.setTmdbSearch}
          debouncedTmdbSearch={imp.debouncedTmdbSearch}
          searchResults={imp.searchResults}
          searchLoading={imp.searchLoading}
          selectedMedia={imp.selectedMedia}
          onSelectMedia={imp.setSelectedMedia}
          seasonInput={imp.seasonInput}
          onSeasonInputChange={imp.setSeasonInput}
          episodeInput={imp.episodeInput}
          onEpisodeInputChange={imp.setEpisodeInput}
          onSubmit={() => void imp.submitClientImport()}
          isPending={imp.clientImportPending}
        />
      </div>
    </div>
  );
}
