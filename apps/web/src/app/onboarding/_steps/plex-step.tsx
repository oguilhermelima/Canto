"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import { Loader2, Film, Tv } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool, inputCn } from "../_components/constants";
import { PasswordInput } from "../_components/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

export function PlexStep({
  onNext,
  onBack,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  onBack: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const plexSaved = bool(settings, "plex.enabled");
  const [url, setUrl] = useState(str(settings, "plex.url"));
  const [authMode, setAuthMode] = useState<"oauth" | "token">("oauth");
  const [token, setToken] = useState(str(settings, "plex.token"));
  const [polling, setPolling] = useState(false);
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const [connected, setConnected] = useState(plexSaved);
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const authPlex = trpc.settings.authenticatePlex.useMutation();
  const createPlexPin = trpc.settings.plexPinCreate.useMutation();
  const syncPlex = trpc.plex.syncLibraries.useMutation();
  const discoveredLibraries = trpc.sync.discoverServerLibraries.useQuery(
    { serverType: "plex" },
    { enabled: connected && !syncPlex.isPending },
  );
  const addServerLink = trpc.folder.addServerLink.useMutation({
    onSuccess: () => void discoveredLibraries.refetch(),
  });
  const updateServerLink = trpc.folder.updateServerLink.useMutation({
    onSuccess: () => void discoveredLibraries.refetch(),
  });
  const plexPinCheck = trpc.settings.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "", serverUrl: url || undefined },
    { enabled: polling && pinData !== null, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (plexPinCheck.data?.authenticated) {
      setPolling(false);
      setPinData(null);
      setConnected(true);
      setMany.mutate({ settings: [{ key: "plex.enabled", value: true }] }, { onSuccess: () => syncPlex.mutate() });
      toast.success(plexPinCheck.data.serverName ? `Connected to ${plexPinCheck.data.serverName}` : "Plex connected");
    }
    if (plexPinCheck.data?.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Authentication expired. Please try again.");
    }
  }, [plexPinCheck.data, setMany]);

  const handleOAuth = (): void => {
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
      onError: (err) => toast.error(err.message),
    });
  };

  const handleToken = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await authPlex.mutateAsync({ url, token });
      if (result.success) {
        await setMany.mutateAsync({ settings: [{ key: "plex.enabled", value: true }] });
        setConnected(true);
        toast.success(`Connected to ${result.serverName || "Plex"}`);
        syncPlex.mutate();
      } else {
        toast.error(result.error ?? "Connection failed");
      }
    } catch {
      toast.error("Failed to connect to Plex");
    } finally {
      setTesting(false);
    }
  };

  const canSubmitToken = url && token;

  useEffect(() => {
    configureFooter({
      onPrimary: connected ? onNext : authMode === "oauth" ? onNext : handleToken,
      primaryLabel: connected ? "Continue" : authMode === "oauth" ? "Skip for now" : "Connect & continue",
      primaryDisabled: !connected && authMode === "token" && (testing || !canSubmitToken),
      primaryLoading: testing,
      onSkip: onNext,
    });
  }, [connected, authMode, testing, url, token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="plex" alt="Plex" />
      <StepHeader
        title="Plex"
        description="Connecting your Plex server lets you jump straight to any movie or show in Plex from its page in Canto — and brings your existing Plex library into Canto so everything stays in sync."
        onBack={onBack}
      />

      <div className="w-full max-w-md space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:32400)" className={inputCn} />
        <div className="flex rounded-xl bg-accent p-1">
          <button type="button" onClick={() => setAuthMode("oauth")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "oauth" ? "bg-background text-foreground" : "text-muted-foreground")}>
            Sign in with Plex
          </button>
          <button type="button" onClick={() => setAuthMode("token")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "token" ? "bg-background text-foreground" : "text-muted-foreground")}>
            Manual Token
          </button>
        </div>
        {authMode === "oauth" ? (
          <Button
            variant="outline"
            onClick={handleOAuth}
            disabled={!url || polling || createPlexPin.isPending}
            className="w-full rounded-xl gap-2"
          >
            {(polling || createPlexPin.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ServiceLogo brand="plex" alt="" size={16} />}
            {polling ? "Waiting for Plex..." : "Sign in with Plex"}
          </Button>
        ) : (
          <PasswordInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="X-Plex-Token" className={inputCn} />
        )}
        {connected && (
          <div className="space-y-2 text-left">
            <p className="text-xs font-semibold text-muted-foreground px-1">
              We found these libraries on your server. Toggle sync to import your collection into Canto.
            </p>
            {syncPlex.isPending || discoveredLibraries.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : discoveredLibraries.data && discoveredLibraries.data.length > 0 ? (
              discoveredLibraries.data.map((lib) => (
                <div
                  key={lib.serverLibraryId}
                  className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {lib.contentType === "movies" ? (
                      <Film className="h-4 w-4 shrink-0 text-blue-400" />
                    ) : (
                      <Tv className="h-4 w-4 shrink-0 text-purple-400" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{lib.serverLibraryName}</p>
                        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                          {lib.contentType === "movies" ? "Movies" : "Shows"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={lib.syncEnabled}
                    onCheckedChange={(checked) => {
                      if (lib.linkId) {
                        updateServerLink.mutate({ id: lib.linkId, syncEnabled: checked });
                      } else {
                        addServerLink.mutate({
                          serverType: "plex",
                          serverLibraryId: lib.serverLibraryId,
                          serverLibraryName: lib.serverLibraryName,
                          serverPath: lib.serverPath ?? undefined,
                          contentType: lib.contentType === "movies" ? "movies" : "shows",
                          syncEnabled: checked,
                        });
                      }
                    }}
                    disabled={updateServerLink.isPending || addServerLink.isPending}
                  />
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-muted/30 px-4 py-3">
                <p className="text-xs text-muted-foreground">No libraries discovered yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
