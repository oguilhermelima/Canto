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
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";
import { TabBar } from "@canto/ui/tab-bar";
import { useManageModal } from "./use-manage-modal";
import { PreferencesTab } from "./preferences-tab";
import { DownloadsTab } from "./downloads-tab";
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
  const activeTabMeta = TABS.find((tab) => tab.value === activeTab) ?? TABS[0];

  // Reset tab when modal closes
  useEffect(() => {
    if (!open) setActiveTab("preferences");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-[76vh] md:max-h-[76vh] md:max-w-4xl md:rounded-[2rem] [&>button:last-child]:hidden">
        <DialogHeader bar className="border-b border-border px-5 py-4 md:px-7 md:py-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-xl font-bold tracking-tight md:text-2xl">
                {mediaTitle}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Manage this title
              </DialogDescription>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </DialogHeader>

        {/* Mobile tab bar */}
        <div className="shrink-0 border-b border-border px-4 md:hidden">
          <TabBar
            tabs={TABS.map(({ value, label, icon }) => ({ value, label, icon }))}
            value={activeTab}
            onChange={(v) => setActiveTab(v as Tab)}
            className="mb-0"
          />
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Desktop sidebar — grouped by Configuration / Safety */}
          <aside
            className="hidden w-[210px] shrink-0 flex-col gap-5 border-r border-border bg-muted/[0.08] px-3 py-4 md:flex"
            role="tablist"
            aria-orientation="vertical"
          >
            <SidebarSection label="Configuration">
              {TABS.filter((tab) => tab.value !== "danger").map((tab) => (
                <SidebarTab
                  key={tab.value}
                  tab={tab}
                  active={activeTab === tab.value}
                  onClick={() => setActiveTab(tab.value)}
                />
              ))}
            </SidebarSection>
            <SidebarSection label="Safety">
              {TABS.filter((tab) => tab.value === "danger").map((tab) => (
                <SidebarTab
                  key={tab.value}
                  tab={tab}
                  active={activeTab === tab.value}
                  danger
                  onClick={() => setActiveTab(tab.value)}
                />
              ))}
            </SidebarSection>
          </aside>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            {manage.isLoading || !manage.media ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                <div className="rounded-2xl border border-border bg-muted/[0.05] px-4 py-3.5 md:px-5">
                  <p
                    className={cn(
                      "text-base font-semibold tracking-tight text-foreground",
                      activeTab === "danger" && "text-red-400",
                    )}
                  >
                    {activeTabMeta.label}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeTab === "preferences" &&
                      "Library, metadata refresh and provider preferences for this title."}
                    {activeTab === "downloads" &&
                      "Inspect torrent files, monitor progress and handle release operations."}
                    {activeTab === "danger" &&
                      "High-impact actions for this title. Proceed carefully."}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-background/80 p-4 md:p-5">
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
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Sidebar primitives ─── */

interface SidebarSectionProps {
  label: string;
  children: React.ReactNode;
}

function SidebarSection({ label, children }: SidebarSectionProps): React.JSX.Element {
  return (
    <div>
      <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

interface SidebarTabProps {
  tab: (typeof TABS)[number];
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}

function SidebarTab({ tab, active, danger, onClick }: SidebarTabProps): React.JSX.Element {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
        danger
          ? active
            ? "bg-red-500/10 text-red-400"
            : "text-red-400 hover:bg-red-500/10"
          : active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{tab.label}</span>
    </button>
  );
}
