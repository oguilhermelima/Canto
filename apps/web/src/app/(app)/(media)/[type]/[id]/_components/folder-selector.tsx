"use client";

import { Folder } from "lucide-react";
import { trpc } from "~/lib/trpc/client";

interface FolderSelectorProps {
  mediaId: string;
  selectedFolderId: string | undefined;
  onSelect: (id: string | undefined) => void;
}

export function FolderSelector({
  mediaId,
  selectedFolderId,
  onSelect,
}: FolderSelectorProps): React.JSX.Element {
  const { data: folders } = trpc.folder.list.useQuery();
  const { data: resolved } = trpc.folder.resolve.useQuery({ mediaId });

  const enabledFolders = (folders ?? []).filter((f) => f.enabled);
  if (enabledFolders.length === 0) return <></>;

  const autoLabel = resolved?.folderName
    ? `Auto (${resolved.folderName})`
    : "Auto";

  return (
    <div className="flex items-center gap-2 px-5 pb-3 md:px-6">
      <Folder size={14} className="shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Library</span>
      <select
        value={selectedFolderId ?? ""}
        onChange={(e) => onSelect(e.target.value || undefined)}
        className="h-7 cursor-pointer rounded-lg border-none bg-muted/50 px-2 text-xs text-foreground outline-none"
      >
        <option value="">{autoLabel}</option>
        {enabledFolders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}
