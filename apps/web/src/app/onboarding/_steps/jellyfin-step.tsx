"use client";

import { useState, useEffect } from "react";
import { Input } from "@canto/ui/input";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str, bool } from "../_components/constants";
import { PasswordInput } from "@canto/ui/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

export function JellyfinStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const jellyfinSaved = bool(settings, "jellyfin.enabled");
  const [url, setUrl] = useState(str(settings, "jellyfin.url"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(jellyfinSaved);
  const [testing, setTesting] = useState(false);

  const utils = trpc.useUtils();
  const saveSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const authenticate = trpc.settings.authenticateJellyfin.useMutation();

  const canSubmit = url && username && password;

  const handleConnect = async (): Promise<void> => {
    if (!url) {
      toast.error("Server URL is required");
      return;
    }
    setTesting(true);
    try {
      const auth = await authenticate.mutateAsync({ url, username, password });
      if (!auth.success || !auth.token) {
        toast.error(auth.error ?? "Failed to connect to Jellyfin");
        return;
      }
      const settingsToSave: { key: string; value: string | boolean }[] = [
        { key: "jellyfin.url", value: url },
        { key: "jellyfin.enabled", value: true },
        { key: "jellyfin.apiKey", value: auth.token },
      ];
      if (auth.userId) settingsToSave.push({ key: "jellyfin.adminUserId", value: auth.userId });
      await saveSettings.mutateAsync({ settings: settingsToSave });
      setConnected(true);
      toast.success("Jellyfin server configured");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect to Jellyfin";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    configureFooter({
      onPrimary: connected ? onNext : handleConnect,
      primaryLabel: connected ? "Continue" : "Connect & continue",
      primaryDisabled: !connected && (testing || !canSubmit),
      primaryLoading: testing || saveSettings.isPending || authenticate.isPending,
      onSkip: connected ? undefined : onNext,
    });
  }, [connected, testing, url, username, password, saveSettings.isPending, authenticate.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="jellyfin" alt="Jellyfin" />
      <StepHeader
        title="Jellyfin"
        description="Point Canto at your Jellyfin server. This sets up server-wide access — each user links their own account later."
      />

      {connected ? (
        <div className="w-full max-w-md space-y-3">
          <div className="rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
            Server linked. Users will authenticate with their own Jellyfin accounts in the next step.
          </div>
          <button
            type="button"
            onClick={() => {
              setConnected(false);
              setUsername("");
              setPassword("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Change server settings
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:8096)" variant="ghost" />
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Admin username" variant="ghost" />
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" variant="ghost" />
        </div>
      )}
    </div>
  );
}
