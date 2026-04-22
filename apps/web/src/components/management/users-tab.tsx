"use client";

import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { SettingsSection } from "@/components/settings/shared";
import { StateMessage } from "@canto/ui/state-message";

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function UsersTab(): React.JSX.Element {
  const { data: users, isLoading } = trpc.auth.list.useQuery();

  return (
    <SettingsSection
      title="Users"
      description="People with access to this Canto instance. Admins can manage services, downloads, and media server connections."
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {(users ?? []).map((u) => (
            <div key={u.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{u.name}</p>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {u.role === "admin" ? (
                  <Badge variant="secondary" className="gap-1.5 bg-primary/10 text-primary rounded-lg px-2.5 py-1">
                    <ShieldCheck className="h-3 w-3" />
                    Admin
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-lg px-2.5 py-1">User</Badge>
                )}
                <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(u.createdAt)}</span>
              </div>
            </div>
          ))}
          {(users ?? []).length === 0 && (
            <StateMessage preset="emptyGrid" minHeight="200px" />
          )}
        </div>
      )}
    </SettingsSection>
  );
}
