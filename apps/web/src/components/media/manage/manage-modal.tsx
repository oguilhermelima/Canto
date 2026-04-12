"use client";

import { useState, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Settings2,
  Download,
  Server,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";
import { useManageModal } from "./use-manage-modal";
import { PreferencesTab } from "./preferences-tab";
import { DownloadsTab } from "./downloads-tab";
import { ServersTab } from "./servers-tab";
import { DangerZoneTab } from "./danger-zone-tab";

/* ─── Types ─── */

interface ManageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaId: string;
  mediaType: "movie" | "show";
  mediaTitle: string;
}

const TABS = [
  { value: "preferences", label: "Preferences", icon: Settings2 },
  { value: "downloads", label: "Downloads", icon: Download },
  { value: "servers", label: "Servers", icon: Server },
  { value: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

type Tab = (typeof TABS)[number]["value"];

/* ─── Main Component ─── */

export function ManageModal({
  open,
  onOpenChange,
  mediaId,
  mediaType,
  mediaTitle,
}: ManageModalProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>("preferences");

  const manage = useManageModal(mediaId, mediaType, open, () =>
    onOpenChange(false),
  );

  // Reset tab when modal closes
  useEffect(() => {
    if (!open) setActiveTab("preferences");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-[85vh] md:max-h-[85vh] md:max-w-5xl md:rounded-[2rem] [&>button:last-child]:hidden">
        <DialogHeader bar className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{mediaTitle}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
              Manage settings
            </DialogDescription>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </DialogHeader>

        {/* Mobile tab pills */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/40 px-5 py-3 md:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                activeTab === tab.value
                  ? "bg-foreground text-background"
                  : "bg-muted/40 text-muted-foreground",
                tab.value === "danger" &&
                  activeTab !== "danger" &&
                  "text-red-400",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="flex min-h-0 flex-1">
          {/* Desktop sidebar */}
          <div className="hidden w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/40 bg-muted/20 p-2 md:flex">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  activeTab === tab.value
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  tab.value === "danger" &&
                    activeTab !== "danger" &&
                    "text-red-400 hover:text-red-400",
                )}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6">
            {manage.isLoading || !manage.media ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {activeTab === "preferences" && (
                  <PreferencesTab
                    media={manage.media}
                    mediaId={mediaId}
                    mediaType={mediaType}
                    libraries={manage.libraries}
                    setMediaLibrary={manage.setMediaLibrary}
                    setContinuousDownload={manage.setContinuousDownload}
                    refreshMeta={manage.refreshMeta}
                    invalidateMedia={manage.invalidateMedia}
                  />
                )}

                {activeTab === "downloads" && (
                  <DownloadsTab
                    mediaType={mediaType}
                    seasons={manage.seasons}
                    torrentsLoading={manage.torrentsLoading}
                    filesByEpKey={manage.filesByEpKey}
                    movieFiles={manage.movieFiles}
                    liveTorrents={manage.liveTorrents}
                    torrentsBySeason={manage.torrentsBySeason}
                    torrentPause={manage.torrentPause}
                    torrentResume={manage.torrentResume}
                    torrentDelete={manage.torrentDelete}
                    torrentRetry={manage.torrentRetry}
                    torrentRename={manage.torrentRename}
                    torrentMove={manage.torrentMove}
                  />
                )}

                {activeTab === "servers" && (
                  <ServersTab
                    mediaType={mediaType}
                    seasons={manage.seasons}
                    availability={manage.availability}
                    mediaServers={manage.mediaServers}
                  />
                )}

                {activeTab === "danger" && (
                  <DangerZoneTab
                    media={manage.media}
                    mediaId={mediaId}
                    mediaTorrents={manage.mediaTorrents}
                    removeFromServer={manage.removeFromServer}
                    addToLibrary={manage.addToLibrary}
                    markDownloaded={manage.markDownloaded}
                    deleteMutation={manage.deleteMutation}
                    torrentDelete={manage.torrentDelete}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
