"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Tv,
  Film,
  HardDrive,
  Download,
  CheckCircle2,
  AlertCircle,
  Upload,
  Server,
  Search,
  Database,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { SettingsSection } from "~/components/settings/shared";

/* -------------------------------------------------------------------------- */
/*  Stat card                                                                  */
/* -------------------------------------------------------------------------- */

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  href,
  color = "text-primary",
  bgColor = "bg-primary/10",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  loading?: boolean;
  href?: string;
  color?: string;
  bgColor?: string;
}): React.JSX.Element {
  const content = (
    <div className={cn(
      "rounded-2xl border border-border/60 bg-card p-5 transition-colors",
      href && "cursor-pointer hover:bg-muted/10",
    )}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", bgColor)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-2xl font-bold text-foreground">{value}</p>
      )}
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

/* -------------------------------------------------------------------------- */
/*  Service status row                                                         */
/* -------------------------------------------------------------------------- */

function ServiceRow({
  name,
  enabled,
  icon: Icon,
}: {
  name: string;
  enabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20 last:border-0">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", enabled ? "bg-emerald-500" : "bg-muted-foreground/30")} />
        <span className={cn("text-xs", enabled ? "text-emerald-500" : "text-muted-foreground")}>
          {enabled ? "Connected" : "Not configured"}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Torrent row                                                                */
/* -------------------------------------------------------------------------- */

function TorrentRow({ torrent }: { torrent: { id: string; title: string; quality: string | null; status: string } }): React.JSX.Element {
  const statusColor = torrent.status === "downloading" ? "text-blue-400" : torrent.status === "completed" ? "text-emerald-400" : torrent.status === "error" ? "text-red-400" : "text-muted-foreground";
  const statusBg = torrent.status === "downloading" ? "bg-blue-500/10" : torrent.status === "completed" ? "bg-emerald-500/10" : torrent.status === "error" ? "bg-red-500/10" : "bg-muted";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{torrent.title}</p>
        {torrent.quality && <p className="text-xs text-muted-foreground">{torrent.quality}</p>}
      </div>
      <Badge variant="secondary" className={cn("shrink-0 text-xs", statusBg, statusColor)}>
        {torrent.status}
      </Badge>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main dashboard                                                             */
/* -------------------------------------------------------------------------- */

export function StatusTab(): React.JSX.Element {
  const { data: stats, isLoading: statsLoading } = trpc.library.stats.useQuery();
  const { data: torrents, isLoading: torrentsLoading } = trpc.torrent.list.useQuery();
  const { data: services } = trpc.settings.getEnabledServices.useQuery();

  const activeTorrents = torrents?.filter((t) => t.status === "downloading") ?? [];
  const completedTorrents = torrents?.filter((t) => t.status === "completed") ?? [];
  const errorTorrents = torrents?.filter((t) => t.status === "error") ?? [];
  const seedingTorrents = torrents?.filter((t) => t.imported && t.status === "completed") ?? [];

  return (
    <div>
      {/* Library */}
      <SettingsSection variant="grid" title="Library" description="Overview of your media collection and download activity.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Film} label="Movies" value={stats?.movies ?? 0} loading={statsLoading} href="/collection/server-library?type=movie" />
          <StatCard icon={Tv} label="Shows" value={stats?.shows ?? 0} loading={statsLoading} href="/collection/server-library?type=show" />
          <StatCard icon={Database} label="Total Media" value={stats?.total ?? 0} loading={statsLoading} />
          <StatCard icon={HardDrive} label="Torrents" value={torrents?.length ?? 0} loading={torrentsLoading} href="/torrents" />
        </div>
      </SettingsSection>

      {/* Downloads */}
      <SettingsSection variant="grid" title="Downloads" description="Current download and seeding activity across all folders.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={Download} label="Downloading" value={activeTorrents.length} loading={torrentsLoading} color="text-blue-400" bgColor="bg-blue-500/10" />
            <StatCard icon={CheckCircle2} label="Completed" value={completedTorrents.length} loading={torrentsLoading} color="text-emerald-400" bgColor="bg-emerald-500/10" />
            <StatCard icon={AlertCircle} label="Failed" value={errorTorrents.length} loading={torrentsLoading} color="text-red-400" bgColor="bg-red-500/10" />
          </div>

          {activeTorrents.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card px-4">
              {activeTorrents.slice(0, 5).map((t) => (
                <TorrentRow key={t.id} torrent={t} />
              ))}
              {activeTorrents.length > 5 && (
                <Link href="/torrents" className="block py-3 text-sm text-primary hover:text-primary/80 transition-colors">
                  View all {activeTorrents.length} downloads
                </Link>
              )}
            </div>
          )}

          {errorTorrents.length > 0 && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.02] px-4">
              {errorTorrents.slice(0, 3).map((t) => (
                <TorrentRow key={t.id} torrent={t} />
              ))}
              {errorTorrents.length > 3 && (
                <Link href="/torrents" className="block py-3 text-sm text-red-400/80 hover:text-red-400 transition-colors">
                  View all {errorTorrents.length} failed
                </Link>
              )}
            </div>
          )}

          {!torrentsLoading && activeTorrents.length === 0 && errorTorrents.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {seedingTorrents.length > 0 ? (
                <>
                  <Upload className="h-4 w-4" />
                  {seedingTorrents.length} torrent{seedingTorrents.length !== 1 ? "s" : ""} seeding
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  No active downloads
                </>
              )}
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Services */}
      <SettingsSection variant="grid" title="Services" description="Connection status for all configured external services.">
        <div className="rounded-2xl border border-border/60 bg-card px-4">
          <ServiceRow name="TMDB" enabled={true} icon={Film} />
          <ServiceRow name="TVDB" enabled={services?.tvdb ?? false} icon={Tv} />
          <ServiceRow name="qBittorrent" enabled={services?.qbittorrent ?? false} icon={Download} />
          <ServiceRow name="Prowlarr" enabled={services?.prowlarr ?? false} icon={Search} />
          <ServiceRow name="Jackett" enabled={services?.jackett ?? false} icon={Search} />
          <ServiceRow name="Jellyfin" enabled={services?.jellyfin ?? false} icon={Server} />
          <ServiceRow name="Plex" enabled={services?.plex ?? false} icon={Server} />
        </div>
      </SettingsSection>

      {/* System */}
      <SettingsSection variant="grid" title="System" description="Version and instance information.">
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-4">
            <Image src="/canto.svg" alt="Canto" width={40} height={40} className="h-10 w-10 dark:invert" />
            <div>
              <p className="text-sm font-semibold text-foreground">Canto</p>
              <p className="text-sm text-muted-foreground">Version 0.1.0</p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
