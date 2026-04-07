"use client";

import { useState, useEffect } from "react";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import { Badge } from "@canto/ui/badge";
import { Skeleton } from "@canto/ui/skeleton";
import { cn } from "@canto/ui/cn";
import { Film, Tv } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool, inputCn } from "../_components/constants";
import { PasswordInput } from "../_components/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

export function JellyfinStep({
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
  const jellyfinSaved = bool(settings, "jellyfin.enabled");
  const [url, setUrl] = useState(str(settings, "jellyfin.url"));
  const hasApiKey = !!str(settings, "jellyfin.apiKey");
  const [authMode, setAuthMode] = useState<"credentials" | "apikey">(hasApiKey ? "apikey" : "credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState(str(settings, "jellyfin.apiKey"));
  const [connected, setConnected] = useState(jellyfinSaved);
  const [testing, setTesting] = useState(false);

  const authJellyfin = trpc.settings.authenticateJellyfin.useMutation();
  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();
  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation();
  const discoveredLibraries = trpc.sync.discoverServerLibraries.useQuery(
    { serverType: "jellyfin" },
    { enabled: connected && !syncJellyfin.isPending },
  );
  const addServerLink = trpc.folder.addServerLink.useMutation({
    onSuccess: () => void discoveredLibraries.refetch(),
  });
  const updateServerLink = trpc.folder.updateServerLink.useMutation({
    onSuccess: () => void discoveredLibraries.refetch(),
  });

  const canSubmit = url && (authMode === "credentials" ? username : apiKey);

  useEffect(() => {
    configureFooter({
      onPrimary: connected ? onNext : handleConnect,
      primaryLabel: connected ? "Continue" : "Connect & continue",
      primaryDisabled: !connected && (testing || !canSubmit),
      primaryLoading: testing,
      onSkip: onNext,
    });
  }, [connected, testing, url, authMode, username, apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (): Promise<void> => {
    setTesting(true);
    try {
      if (authMode === "credentials") {
        const result = await authJellyfin.mutateAsync({ url, username, password });
        if (result.success) {
          await setMany.mutateAsync({ settings: [{ key: "jellyfin.enabled", value: true }] });
          setConnected(true);
          toast.success(`Connected to ${result.serverName || "Jellyfin"}`);
          syncJellyfin.mutate();
        } else {
          toast.error(result.error ?? "Authentication failed");
        }
      } else {
        await setMany.mutateAsync({
          settings: [
            { key: "jellyfin.url", value: url },
            { key: "jellyfin.apiKey", value: apiKey },
            { key: "jellyfin.enabled", value: true },
          ],
        });
        const result = await testService.mutateAsync({
          service: "jellyfin",
          values: { "jellyfin.url": url, "jellyfin.apiKey": apiKey },
        });
        if (result.connected) {
          setConnected(true);
          toast.success("Jellyfin connected");
          syncJellyfin.mutate();
        } else {
          toast.error("Connection failed. Check your URL and API key.");
        }
      }
    } catch {
      toast.error("Failed to connect to Jellyfin");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="jellyfin" alt="Jellyfin" />
      <StepHeader
        title="Jellyfin"
        description="Connecting your Jellyfin server lets you jump straight to any movie or show in Jellyfin from its page in Canto — and brings your existing Jellyfin library into Canto so everything stays in sync."
        onBack={onBack}
      />

      <div className="w-full max-w-md space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:8096)" className={inputCn} />
        <div className="flex rounded-xl bg-accent p-1">
          <button type="button" onClick={() => setAuthMode("credentials")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "credentials" ? "bg-background text-foreground" : "text-muted-foreground")}>
            Username & Password
          </button>
          <button type="button" onClick={() => setAuthMode("apikey")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "apikey" ? "bg-background text-foreground" : "text-muted-foreground")}>
            API Key
          </button>
        </div>
        {authMode === "credentials" ? (
          <>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputCn} />
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCn} />
          </>
        ) : (
          <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className={inputCn} />
        )}
        {connected && (
          <div className="space-y-2 text-left">
            <p className="text-xs font-semibold text-muted-foreground px-1">
              We found these libraries on your server. Toggle sync to import your collection into Canto.
            </p>
            {syncJellyfin.isPending || discoveredLibraries.isLoading ? (
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
                          serverType: "jellyfin",
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
