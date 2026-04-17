"use client";

import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Tv,
  Film,
  HardDrive,
  Download,
  ArrowDown,
  ArrowUp,
  Server,
  Search,
  Database,
  Cpu,
  MemoryStick,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { SettingsSection } from "~/components/settings/shared";

/* ─── Helpers ─── */

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/* ─── Stat card ─── */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  href,
  color = "text-primary",
  bgColor = "bg-primary/10",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  loading?: boolean;
  href?: string;
  color?: string;
  bgColor?: string;
}): React.JSX.Element {
  const content = (
    <div className={cn(
      "rounded-2xl border border-border bg-card p-5 transition-colors",
      href && "cursor-pointer hover:bg-muted/10",
    )}>
      <div className="mb-3 flex items-center gap-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", bgColor)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

/* ─── Progress bar ─── */

function UsageBar({ used, total, label, icon: Icon, color, format = formatBytes }: {
  used: number;
  total: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  format?: (v: number) => string;
}): React.JSX.Element {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className="text-sm text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/60">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {format(used)} used of {format(total)}
      </p>
    </div>
  );
}

/* ─── Service row ─── */

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
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
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

/* ─── Main component ─── */

export function StatusTab(): React.JSX.Element {
  const { data: stats, isLoading: statsLoading } = trpc.library.stats.useQuery();
  const { data: torrents, isLoading: torrentsLoading } = trpc.torrent.list.useQuery();
  const { data: services } = trpc.settings.getEnabledServices.useQuery();
  const { data: sysInfo, isLoading: sysLoading } = trpc.system.info.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  return (
    <div>
      {/* Library */}
      <SettingsSection title="Library" description="Media collection overview.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Film} label="Movies" value={stats?.movies ?? 0} loading={statsLoading} href="/collection/server-library?type=movie" color="text-blue-400" bgColor="bg-blue-500/10" />
          <StatCard icon={Tv} label="Shows" value={stats?.shows ?? 0} loading={statsLoading} href="/collection/server-library?type=show" color="text-violet-400" bgColor="bg-violet-500/10" />
          <StatCard icon={Database} label="Total Media" value={stats?.total ?? 0} loading={statsLoading} color="text-emerald-400" bgColor="bg-emerald-500/10" />
          <StatCard icon={HardDrive} label="Torrents" value={torrents?.length ?? 0} loading={torrentsLoading} href="/download" color="text-amber-400" bgColor="bg-amber-500/10" />
        </div>
      </SettingsSection>

      {/* System Resources */}
      <SettingsSection title="System" description="Server resource usage.">
        {sysLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sysInfo && (
              <>
                <UsageBar
                  icon={Cpu}
                  label={`CPU · ${sysInfo.cpu.cores} cores`}
                  used={sysInfo.cpu.usage}
                  total={100}
                  color="bg-blue-500"
                  format={(v) => `${v}%`}
                />
                <UsageBar
                  icon={MemoryStick}
                  label="Memory"
                  used={sysInfo.ram.used}
                  total={sysInfo.ram.total}
                  color="bg-violet-500"
                />
              </>
            )}
          </div>
        )}
      </SettingsSection>

      {/* Storage */}
      <SettingsSection title="Storage" description="Disk usage for local library and download client.">
        {sysLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sysInfo?.localDisk && (
                <UsageBar
                  icon={HardDrive}
                  label="Local Storage"
                  used={sysInfo.localDisk.total - sysInfo.localDisk.free}
                  total={sysInfo.localDisk.total}
                  color="bg-emerald-500"
                />
              )}
              {sysInfo?.qbitDisk && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <Download className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">qBittorrent</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{formatBytes(sysInfo.qbitDisk.free)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">free space</p>
                  {(sysInfo.qbitDisk.dlSpeed > 0 || sysInfo.qbitDisk.upSpeed > 0) && (
                    <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ArrowDown className="h-3 w-3 text-blue-400" />
                        {formatSpeed(sysInfo.qbitDisk.dlSpeed)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ArrowUp className="h-3 w-3 text-emerald-400" />
                        {formatSpeed(sysInfo.qbitDisk.upSpeed)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {!sysInfo?.localDisk && !sysInfo?.qbitDisk && (
              <p className="text-sm text-muted-foreground">No storage information available. Configure download folders or qBittorrent.</p>
            )}
          </div>
        )}
      </SettingsSection>

      {/* Services */}
      <SettingsSection title="Services" description="Connection status for configured services.">
        <div className="rounded-2xl border border-border bg-card px-4">
          <ServiceRow name="TMDB" enabled={true} icon={Film} />
          <ServiceRow name="TVDB" enabled={services?.tvdb ?? false} icon={Tv} />
          <ServiceRow name="qBittorrent" enabled={services?.qbittorrent ?? false} icon={Download} />
          <ServiceRow name="Prowlarr" enabled={services?.prowlarr ?? false} icon={Search} />
          <ServiceRow name="Jackett" enabled={services?.jackett ?? false} icon={Search} />
          <ServiceRow name="Jellyfin" enabled={services?.jellyfin ?? false} icon={Server} />
          <ServiceRow name="Plex" enabled={services?.plex ?? false} icon={Server} />
        </div>
      </SettingsSection>

      {/* Version */}
      <SettingsSection title="Instance" description="Version and build information.">
        <div className="rounded-2xl border border-border bg-card p-5">
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
