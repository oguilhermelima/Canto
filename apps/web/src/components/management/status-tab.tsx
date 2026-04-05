"use client";

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
  Clock,
  Upload,
  Folder,
  Server,
  Search,
  Database,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";

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
      "rounded-2xl border border-border/40 p-5 transition-colors",
      href && "hover:bg-muted/10 cursor-pointer",
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

function ServiceStatus({
  name,
  enabled,
  icon: Icon,
}: {
  name: string;
  enabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", enabled ? "bg-emerald-500" : "bg-muted-foreground/30")} />
        <span className={cn("text-xs", enabled ? "text-emerald-500" : "text-muted-foreground/50")}>
          {enabled ? "Connected" : "Not configured"}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Torrent row                                                                */
/* -------------------------------------------------------------------------- */

function TorrentRow({ torrent }: { torrent: { id: string; title: string; quality: string | null; status: string; progress?: number } }): React.JSX.Element {
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
    <div className="space-y-8 py-2">

      {/* Library stats */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Library</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Film} label="Movies" value={stats?.movies ?? 0} loading={statsLoading} href="/library?type=movie" />
          <StatCard icon={Tv} label="Shows" value={stats?.shows ?? 0} loading={statsLoading} href="/library?type=show" />
          <StatCard icon={Database} label="Total Media" value={stats?.total ?? 0} loading={statsLoading} />
          <StatCard icon={HardDrive} label="Torrents" value={torrents?.length ?? 0} loading={torrentsLoading} href="/torrents" />
        </div>
      </section>

      {/* Downloads overview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Downloads</h2>
          <div className="flex items-center gap-2">
            {activeTorrents.length > 0 && (
              <Badge variant="outline" className="gap-1.5 text-xs">
                <Download className="h-3 w-3" />
                {activeTorrents.length} active
              </Badge>
            )}
            {seedingTorrents.length > 0 && (
              <Badge variant="outline" className="gap-1.5 text-xs">
                <Upload className="h-3 w-3" />
                {seedingTorrents.length} seeding
              </Badge>
            )}
            {errorTorrents.length > 0 && (
              <Badge variant="outline" className="gap-1.5 text-xs border-red-500/30 text-red-400">
                <AlertCircle className="h-3 w-3" />
                {errorTorrents.length} failed
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={Download} label="Downloading" value={activeTorrents.length} loading={torrentsLoading} color="text-blue-400" bgColor="bg-blue-500/10" />
          <StatCard icon={CheckCircle2} label="Completed" value={completedTorrents.length} loading={torrentsLoading} color="text-emerald-400" bgColor="bg-emerald-500/10" />
          <StatCard icon={AlertCircle} label="Failed" value={errorTorrents.length} loading={torrentsLoading} color="text-red-400" bgColor="bg-red-500/10" />
        </div>

        {/* Active downloads list */}
        {activeTorrents.length > 0 && (
          <div className="rounded-2xl border border-border/40 p-4">
            <p className="text-sm font-medium text-foreground mb-2">Active Downloads</p>
            {activeTorrents.slice(0, 5).map((t) => (
              <TorrentRow key={t.id} torrent={t} />
            ))}
            {activeTorrents.length > 5 && (
              <Link href="/torrents" className="block pt-2 text-sm text-primary hover:text-primary/80 transition-colors">
                View all {activeTorrents.length} downloads
              </Link>
            )}
          </div>
        )}

        {/* Error list */}
        {errorTorrents.length > 0 && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.02] p-4">
            <p className="text-sm font-medium text-red-400 mb-2">Failed Downloads</p>
            {errorTorrents.slice(0, 3).map((t) => (
              <TorrentRow key={t.id} torrent={t} />
            ))}
            {errorTorrents.length > 3 && (
              <Link href="/torrents" className="block pt-2 text-sm text-red-400/80 hover:text-red-400 transition-colors">
                View all {errorTorrents.length} failed
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Connected services */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Services</h2>
        <div className="rounded-2xl border border-border/40 divide-y divide-border/20 px-4">
          <ServiceStatus name="TMDB" enabled={true} icon={Film} />
          <ServiceStatus name="TVDB" enabled={services?.tvdb ?? false} icon={Tv} />
          <ServiceStatus name="qBittorrent" enabled={services?.qbittorrent ?? false} icon={Download} />
          <ServiceStatus name="Prowlarr" enabled={services?.prowlarr ?? false} icon={Search} />
          <ServiceStatus name="Jackett" enabled={services?.jackett ?? false} icon={Search} />
          <ServiceStatus name="Jellyfin" enabled={services?.jellyfin ?? false} icon={Server} />
          <ServiceStatus name="Plex" enabled={services?.plex ?? false} icon={Server} />
        </div>
      </section>

      {/* System info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">System</h2>
        <div className="rounded-2xl border border-border/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/room.png" alt="Canto" className="h-8 w-8 dark:invert" />
              <div>
                <p className="text-sm font-semibold text-foreground">Canto</p>
                <p className="text-xs text-muted-foreground">Version 0.1.0</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
