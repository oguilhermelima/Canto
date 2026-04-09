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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(jellyfinSaved);
  const [testing, setTesting] = useState(false);

  const utils = trpc.useUtils();
  const saveSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const addConnection = trpc.userConnection.add.useMutation();

  const canSubmit = url && username && password;

  useEffect(() => {
    configureFooter({
      onPrimary: connected ? onNext : handleConnect,
      primaryLabel: connected ? "Continue" : "Connect & continue",
      primaryDisabled: !connected && (testing || !canSubmit),
      primaryLoading: testing || saveSettings.isPending || addConnection.isPending,
      onSkip: onNext,
    });
  }, [connected, testing, url, username, password, saveSettings.isPending, addConnection.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (): Promise<void> => {
    if (!url) {
      toast.error("Server URL is required");
      return;
    }
    setTesting(true);
    try {
      await saveSettings.mutateAsync({
        settings: [
          { key: "jellyfin.url", value: url },
          { key: "jellyfin.enabled", value: true },
        ],
      });

      const result = await addConnection.mutateAsync({
        provider: "jellyfin",
        username,
        password,
      });

      if (result.success) {
        setConnected(true);
        toast.success("Connected to Jellyfin — your library is being imported");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect to Jellyfin";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="jellyfin" alt="Jellyfin" />
      <StepHeader
        title="Jellyfin"
        description="Connecting your Jellyfin account imports your entire library into Canto and keeps watch progress in sync."
        onBack={onBack}
      />

      {connected ? (
        <div className="w-full max-w-md rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
          Your Jellyfin library is being imported in the background. This may take a few minutes.
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:8096)" variant="ghost" />
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" variant="ghost" />
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" variant="ghost" />
        </div>
      )}
    </div>
  );
}
