"use client";

import { useState, useEffect } from "react";
import { trpc } from "~/lib/trpc/client";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { PasswordInput } from "@canto/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { Plus, Loader2, Unlink, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@canto/ui/cn";
import { SettingsSection } from "~/components/settings/shared";

/* -------------------------------------------------------------------------- */
/*  Brand config                                                               */
/* -------------------------------------------------------------------------- */

const BRAND = {
  plex: {
    color: "#e5a00d",
    bg: "bg-[#e5a00d]/10",
    border: "border-[#e5a00d]/20",
    ring: "ring-[#e5a00d]/30",
    label: "Plex",
    logo: "/plex-logo.svg",
  },
  jellyfin: {
    color: "#a95ce0",
    bg: "bg-[#a95ce0]/10",
    border: "border-[#a95ce0]/20",
    ring: "ring-[#a95ce0]/30",
    label: "Jellyfin",
    logo: "/jellyfin-logo.svg",
  },
} as const;

type Provider = keyof typeof BRAND;

function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/* -------------------------------------------------------------------------- */
/*  Provider logo                                                              */
/* -------------------------------------------------------------------------- */

function ProviderIcon({
  provider,
  size = 24,
}: {
  provider: Provider;
  size?: number;
}): React.JSX.Element {
  const brand = BRAND[provider];
  return (
    <span
      style={{
        width: size,
        height: size,
        backgroundColor: brand.color,
        display: "block",
        mask: `url(${brand.logo}) center/contain no-repeat`,
        WebkitMask: `url(${brand.logo}) center/contain no-repeat`,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Connection card                                                            */
/* -------------------------------------------------------------------------- */

function ConnectionCard({
  conn,
  onDisconnect,
  onReauthenticate,
}: {
  conn: {
    id: string;
    provider: string;
    enabled: boolean;
    updatedAt: Date | string;
    staleReason: string | null;
  };
  onDisconnect: (id: string) => void;
  onReauthenticate: (provider: Provider) => void;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const provider = conn.provider as Provider;
  const brand = BRAND[provider];
  const isStale = conn.staleReason != null;

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border bg-muted/20 px-5 py-4 transition-colors",
        isStale ? "border-amber-500/40" : brand.border,
      )}
    >
      <div className="flex items-center gap-5">
        {/* Icon */}
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
            brand.bg,
            brand.border,
          )}
        >
          <ProviderIcon provider={provider} size={22} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{brand.label}</span>
            {isStale ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                Re-authentication needed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Updated {formatRelative(conn.updatedAt)}
          </p>
        </div>

        {/* Action */}
        {confirming ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">Disconnect?</span>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => onDisconnect(conn.id)}
            >
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl h-7 px-2 text-xs"
              onClick={() => setConfirming(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {isStale && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl gap-1.5 text-amber-500 hover:bg-amber-500/10"
                onClick={() => onReauthenticate(provider)}
              >
                Re-authenticate
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-xl gap-1.5 text-muted-foreground transition-opacity hover:text-destructive hover:bg-destructive/10",
                isStale ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
              onClick={() => setConfirming(true)}
            >
              <Unlink className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {isStale && (
        <p className="text-xs text-amber-500 pl-[68px]">
          {conn.staleReason}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty provider slot                                                        */
/* -------------------------------------------------------------------------- */

const SLOT_HOVER: Record<Provider, string> = {
  plex: "hover:border-[#e5a00d]/30",
  jellyfin: "hover:border-[#a95ce0]/30",
};

function ProviderSlot({
  provider,
  onConnect,
}: {
  provider: Provider;
  onConnect: () => void;
}): React.JSX.Element {
  const brand = BRAND[provider];
  return (
    <button
      type="button"
      onClick={onConnect}
      className={cn(
        "group flex w-full items-center gap-5 rounded-2xl border border-dashed px-5 py-4 transition-all hover:border-solid hover:bg-muted/20",
        "border-border/40",
        SLOT_HOVER[provider],
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/30 bg-muted/30 transition-colors group-hover:bg-muted/60">
        <ProviderIcon provider={provider} size={20} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground">
          {brand.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Not connected</p>
      </div>
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        <Plus className="h-3.5 w-3.5" />
        Connect
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main section                                                               */
/* -------------------------------------------------------------------------- */

export function ConnectionsSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: connections, isLoading } = trpc.userConnection.list.useQuery();

  const removeConnection = trpc.userConnection.remove.useMutation({
    onSuccess: () => {
      toast.success("Connection removed");
      void utils.userConnection.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addProvider, setAddProvider] = useState<Provider>("plex");

  const openAdd = (provider: Provider) => {
    setAddProvider(provider);
    setAddDialogOpen(true);
  };

  return (
    <SettingsSection
      title="Media Server Connections"
      description="Link your personal accounts to sync watch progress and ratings."
    >
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(["plex", "jellyfin"] as Provider[]).map((provider) => {
            const conn = connections?.find((c) => c.provider === provider);
            if (conn) {
              return (
                <ConnectionCard
                  key={provider}
                  conn={conn}
                  onDisconnect={(id) => removeConnection.mutate({ id })}
                  onReauthenticate={openAdd}
                />
              );
            }
            return (
              <ProviderSlot key={provider} provider={provider} onConnect={() => openAdd(provider)} />
            );
          })}
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <AddConnectionForm
            provider={addProvider}
            onSuccess={() => {
              setAddDialogOpen(false);
              void utils.userConnection.list.invalidate();
            }}
          />
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add connection form                                                        */
/* -------------------------------------------------------------------------- */

function AddConnectionForm({
  provider,
  onSuccess,
}: {
  provider: Provider;
  onSuccess: () => void;
}): React.JSX.Element {
  const brand = BRAND[provider];
  const [authMode, setAuthMode] = useState<"oauth" | "token" | "credentials">(
    provider === "plex" ? "oauth" : "credentials",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const addConnection = trpc.userConnection.add.useMutation({
    onSuccess: () => {
      toast.success(`${brand.label} connected — your library is being imported`);
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message);
      setLoading(false);
    },
  });

  const createPlexPin = trpc.userConnection.plexPinCreate.useMutation();
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const [polling, setPolling] = useState(false);

  const plexPinCheck = trpc.userConnection.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "" },
    { enabled: polling && !!pinData, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (plexPinCheck.data?.authenticated) {
      setPolling(false);
      setPinData(null);
      toast.success("Plex connected — your library is being imported");
      onSuccess();
    }
    if (plexPinCheck.data?.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Auth session expired");
    }
  }, [plexPinCheck.data, onSuccess]);

  const handlePlexOAuth = () => {
    setLoading(true);
    createPlexPin.mutate(undefined, {
      onSuccess: (data) => {
        setPinData({ pinId: data.pinId, clientId: data.clientId });
        setPolling(true);
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(
          `https://app.plex.tv/auth#?clientID=${data.clientId}&code=${data.pinCode}&context%5Bdevice%5D%5Bproduct%5D=Canto`,
          "plex-auth",
          `width=${w},height=${h},left=${left},top=${top}`,
        );
      },
      onError: (err) => {
        toast.error(err.message);
        setLoading(false);
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (provider === "plex") {
      addConnection.mutate({ provider: "plex", token });
    } else {
      addConnection.mutate({ provider: "jellyfin", username, password });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", brand.bg, brand.border)}>
            <ProviderIcon provider={provider} size={18} />
          </div>
          <DialogTitle>Connect {brand.label}</DialogTitle>
        </div>
        <DialogDescription>
          {provider === "plex"
            ? "Sign in with your Plex account to start syncing your watch progress."
            : "Enter your Jellyfin credentials to start syncing your watch progress."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {provider === "plex" && (
          <>
            <div className="flex rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setAuthMode("oauth")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium transition-all",
                  authMode === "oauth" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Sign in with Plex
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("token")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-medium transition-all",
                  authMode === "token" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Manual Token
              </button>
            </div>

            {authMode === "oauth" ? (
              <Button
                type="button"
                variant="outline"
                className={cn("w-full rounded-xl gap-2 border-[#e5a00d]/20 hover:bg-[#e5a00d]/10")}
                onClick={handlePlexOAuth}
                disabled={loading || polling}
              >
                {polling || createPlexPin.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ProviderIcon provider="plex" size={16} />
                )}
                {polling ? "Waiting for Plex…" : "Sign in with Plex"}
              </Button>
            ) : (
              <PasswordInput
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="X-Plex-Token"
                variant="ghost"
                className="rounded-xl"
              />
            )}
          </>
        )}

        {provider === "jellyfin" && (
          <div className="space-y-3">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              variant="ghost"
              className="rounded-xl"
              autoFocus
            />
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              variant="ghost"
              className="rounded-xl"
            />
          </div>
        )}
      </div>

      {(provider === "jellyfin" || authMode === "token") && (
        <DialogFooter>
          <Button
            type="submit"
            className="w-full rounded-xl"
            disabled={
              loading ||
              (provider === "jellyfin" && (!username || !password)) ||
              (provider === "plex" && !token)
            }
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}
