"use client";

import { Card, CardContent } from "@canto/ui/card";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { Users, ShieldCheck } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function UsersTab(): React.JSX.Element {
  const usersQuery = trpc.auth.list.useQuery();
  const { data: users, isLoading } = usersQuery;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        {users && (
          <Badge variant="outline" className="gap-1.5">
            <Users size={12} />
            {users.length} user{users.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {usersQuery.isError ? (
        <Card>
          <CardContent className="p-0">
            <StateMessage preset="error" onRetry={() => usersQuery.refetch()} minHeight="200px" />
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-5">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : users && users.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
                            <ShieldCheck size={12} />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline">User</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(u.createdAt)}
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
          <CardContent className="p-0">
            <StateMessage preset="emptyCollections" minHeight="200px" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
