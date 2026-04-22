"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool } from "../_components/constants";
import { PasswordInput } from "@canto/ui/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

type AuthMode = "oauth" | "email";

export function PlexStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const plexSaved = bool(settings, "plex.enabled");
  const [url, setUrl] = useState(str(settings, "plex.url"));
  const [authMode, setAuthMode] = useState<AuthMode>("oauth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [polling, setPolling] = useState(false);
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const [connected, setConnected] = useState(plexSaved);
  const [testing, setTesting] = useState(false);

  const utils = trpc.useUtils();
  const saveSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const loginWithEmail = trpc.settings.loginPlex.useMutation();
  const createPlexPin = trpc.settings.plexPinCreate.useMutation();
  const plexPinCheck = trpc.settings.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "", serverUrl: url },
    { enabled: polling && pinData !== null, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (!polling) return;
    const id = setTimeout(() => {
      setPolling(false);
      setPinData(null);
      toast.error("Plex sign-in timed out — try again");
    }, 5 * 60 * 1000);
    return () => clearTimeout(id);
  }, [polling]);

  useEffect(() => {
    const data = plexPinCheck.data;
    if (!data) return;

    if (data.authenticated && data.token) {
      setPolling(false);
      setPinData(null);
      void (async () => {
        try {
          const toSave: Array<{ key: string; value: unknown }> = [
            { key: "plex.url", value: url },
            { key: "plex.enabled", value: true },
            { key: "plex.token", value: data.token! },
          ];
          if (data.machineId) toSave.push({ key: "plex.machineId", value: data.machineId });
          await saveSettings.mutateAsync({ settings: toSave as never });
          setConnected(true);
          toast.success(data.serverName ? `Plex server linked — ${data.serverName}` : "Plex server linked");
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to save Plex settings";
          toast.error(message);
        }
      })();
    }
    if (data.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Authentication session expired");
    }
  }, [plexPinCheck.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOAuth = (): void => {
    if (!url) {
      toast.error("Server URL is required");
      return;
    }
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

  const handleEmail = async (): Promise<void> => {
    if (!url) {
      toast.error("Server URL is required");
      return;
    }
    setTesting(true);
    try {
      const auth = await loginWithEmail.mutateAsync({ url, email, password });
      if (!auth.success || !auth.token) {
        toast.error(auth.error ?? "Connection failed");
        return;
      }
      const toSave: Array<{ key: string; value: unknown }> = [
        { key: "plex.url", value: url },
        { key: "plex.enabled", value: true },
        { key: "plex.token", value: auth.token },
      ];
      if (auth.machineId) toSave.push({ key: "plex.machineId", value: auth.machineId });
      await saveSettings.mutateAsync({ settings: toSave as never });
      setConnected(true);
      toast.success("Plex server linked");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection failed";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleChangeAccount = (): void => {
    setConnected(false);
    setEmail("");
    setPassword("");
    setAuthMode("oauth");
  };

  const canSubmitEmail = url && email && password;

  useEffect(() => {
    configureFooter({
      onPrimary: connected ? onNext : authMode === "oauth" ? undefined : handleEmail,
      primaryLabel: connected ? "Continue" : "Connect & continue",
      primaryDisabled: !connected && authMode === "email" && (testing || !canSubmitEmail),
      primaryLoading: testing || saveSettings.isPending,
      onSkip: connected ? undefined : onNext,
    });
  }, [connected, authMode, testing, url, email, password, saveSettings.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="plex" alt="Plex" />
      <StepHeader
        title="Plex"
        description="Point Canto at your Plex server. This sets up server-wide access — each user links their own account later."
      />

      {connected ? (
        <div className="w-full max-w-md space-y-3">
          <div className="rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
            Server linked. Users will authenticate with their own Plex accounts in the next step.
          </div>
          <button
            type="button"
            onClick={handleChangeAccount}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Change server settings
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:32400)" variant="ghost" />
          <div className="flex rounded-xl bg-accent p-1">
            <button type="button" onClick={() => setAuthMode("oauth")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "oauth" ? "bg-background text-foreground" : "text-muted-foreground")}>
              Sign in with Plex
            </button>
            <button type="button" onClick={() => setAuthMode("email")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "email" ? "bg-background text-foreground" : "text-muted-foreground")}>
              Email & password
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
            <>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Plex email" type="email" variant="ghost" />
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Plex password" variant="ghost" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
