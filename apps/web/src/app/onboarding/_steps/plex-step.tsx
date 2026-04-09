"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool } from "../_components/constants";
import { PasswordInput } from "@canto/ui/password-input";
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

  const utils = trpc.useUtils();
  const saveSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const addConnection = trpc.userConnection.add.useMutation();
  const createPlexPin = trpc.userConnection.plexPinCreate.useMutation();
  const plexPinCheck = trpc.userConnection.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "" },
    { enabled: polling && pinData !== null, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (plexPinCheck.data?.authenticated) {
      setPolling(false);
      setPinData(null);
      setConnected(true);
      toast.success(plexPinCheck.data.serverName ? `Connected to ${plexPinCheck.data.serverName} — your library is being imported` : "Plex account linked — your library is being imported");
    }
    if (plexPinCheck.data?.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Authentication session expired");
    }
  }, [plexPinCheck.data]);

  const saveUrl = async (): Promise<boolean> => {
    if (!url) {
      toast.error("Server URL is required");
      return false;
    }
    try {
      await saveSettings.mutateAsync({
        settings: [
          { key: "plex.url", value: url },
          { key: "plex.enabled", value: true },
        ],
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save server URL";
      toast.error(message);
      return false;
    }
  };

  const handleOAuth = async (): Promise<void> => {
    const saved = await saveUrl();
    if (!saved) return;

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
      const saved = await saveUrl();
      if (!saved) return;

      const result = await addConnection.mutateAsync({ provider: "plex", token });
      if (result.success) {
        setConnected(true);
        toast.success("Plex account linked — your library is being imported");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection failed";
      toast.error(message);
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
      primaryLoading: testing || saveSettings.isPending,
      onSkip: onNext,
    });
  }, [connected, authMode, testing, url, token, saveSettings.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="plex" alt="Plex" />
      <StepHeader
        title="Plex"
        description="Connecting your Plex account imports your entire library into Canto and keeps watch progress in sync."
        onBack={onBack}
      />

      {connected ? (
        <div className="w-full max-w-md rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
          Your Plex library is being imported in the background. This may take a few minutes.
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:32400)" variant="ghost" />
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
              disabled={!url || polling || createPlexPin.isPending || saveSettings.isPending}
              className="w-full rounded-xl gap-2"
            >
              {(polling || createPlexPin.isPending || saveSettings.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ServiceLogo brand="plex" alt="" size={16} />
              )}
              {polling ? "Waiting for Plex..." : "Sign in with Plex"}
            </Button>
          ) : (
            <PasswordInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="X-Plex-Token" variant="ghost" />
          )}
        </div>
      )}
    </div>
  );
}
