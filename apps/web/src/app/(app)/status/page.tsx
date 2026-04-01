"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@canto/ui/card";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Tv,
  Film,
  HardDrive,
  Activity,
  Download,
  CheckCircle2,
  AlertCircle,
  Plus,
  Settings,
  Search,
} from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";

function getStatusBadgeClass(status: string): string {
  if (status === "downloading") return "bg-blue-100 text-blue-700";
  if (status === "finished") return "bg-green-100 text-green-700";
  if (status === "error") return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

export default function StatusPage(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const { data: stats, isLoading: statsLoading } =
    trpc.library.stats.useQuery();
  const { data: torrents, isLoading: torrentsLoading } =
    trpc.torrent.list.useQuery(undefined, { enabled: isAdmin });

  const activeTorrents =
    torrents?.filter((t) => t.status === "downloading") ?? [];
  const finishedTorrents =
    torrents?.filter((t) => t.status === "finished") ?? [];
  const errorTorrents = torrents?.filter((t) => t.status === "error") ?? [];

  return (
    <div className="w-full">
      <PageHeader title="Status" subtitle="System overview and administration." />

      <div className="flex flex-col gap-8 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 pb-8">

      {/* System Status */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">System Status</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Link href="/library?type=show">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Tv size={20} className="text-primary" />
                </div>
                <div>
                  {statsLoading ? (
                    <Skeleton className="mb-1 h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">
                      {stats?.shows ?? 0}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">Total Shows</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/library?type=movie">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Film size={20} className="text-primary" />
                </div>
                <div>
                  {statsLoading ? (
                    <Skeleton className="mb-1 h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">
                      {stats?.movies ?? 0}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">Total Movies</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {isAdmin && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <HardDrive size={20} className="text-primary" />
                </div>
                <div>
                  {torrentsLoading ? (
                    <Skeleton className="mb-1 h-8 w-16" />
                  ) : (
                    <p className="text-3xl font-bold">
                      {torrents?.length ?? 0}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Total Torrents
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Activity size={20} className="text-primary" />
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="mb-1 h-8 w-16" />
                ) : (
                  <p className="text-3xl font-bold">
                    {stats?.total ?? 0}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Total Library
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Version & Settings */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Activity size={22} className="text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Canto</p>
                <p className="text-sm text-muted-foreground">Version 0.1.0</p>
              </div>
            </CardContent>
          </Card>

          <Link href="/settings">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Settings size={22} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Settings</p>
                  <p className="text-sm text-muted-foreground">
                    Configure your instance
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Active Downloads — admin only */}
      {isAdmin && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active Downloads</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Download size={12} />
                {activeTorrents.length} active
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <CheckCircle2 size={12} />
                {finishedTorrents.length} completed
              </Badge>
              {errorTorrents.length > 0 && (
                <Badge variant="destructive" className="gap-1.5">
                  <AlertCircle size={12} />
                  {errorTorrents.length} error
                  {errorTorrents.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>

          {torrentsLoading ? (
            <Card>
              <CardContent className="p-5">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ) : activeTorrents.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          Quality
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTorrents.map((torrent) => (
                        <tr
                          key={torrent.id}
                          className="border-b last:border-0 hover:bg-muted/40"
                        >
                          <td className="max-w-[400px] truncate px-4 py-3 text-sm font-medium">
                            {torrent.title}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{torrent.quality}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="secondary"
                              className={getStatusBadgeClass(torrent.status)}
                            >
                              {torrent.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Download
                  size={32}
                  className="mx-auto mb-3 text-muted-foreground/50"
                />
                <p className="text-sm text-muted-foreground">
                  No active downloads.
                </p>
              </CardContent>
            </Card>
          )}

          {errorTorrents.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive">
                  Failed Downloads
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          Quality
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorTorrents.map((torrent) => (
                        <tr
                          key={torrent.id}
                          className="border-b last:border-0 hover:bg-muted/40"
                        >
                          <td className="max-w-[400px] truncate px-4 py-3 text-sm font-medium">
                            {torrent.title}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{torrent.quality}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="destructive">error</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* Quick Actions */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/search?type=show">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Plus size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Add TV Show</p>
                  <p className="text-xs text-muted-foreground">
                    Search and add a new show
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/search?type=movie">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Plus size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Add Movie</p>
                  <p className="text-xs text-muted-foreground">
                    Search and add a new movie
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/torrents">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <HardDrive size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Manage Torrents</p>
                  <p className="text-xs text-muted-foreground">
                    View all downloads
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/">
            <Card className="cursor-pointer transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Search size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Discover</p>
                  <p className="text-xs text-muted-foreground">
                    Browse trending media
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
      </div>
    </div>
  );
}
