"use client";

import { useState, useEffect } from "react";
import { Input } from "@canto/ui/input";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str } from "../_components/constants";
import { PasswordInput } from "@canto/ui/password-input";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

export function DownloadClientStep({
  onNext,
  onSkip,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  onSkip: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [url, setUrl] = useState(str(settings, "qbittorrent.url"));
  const [username, setUsername] = useState(str(settings, "qbittorrent.username"));
  const [password, setPassword] = useState(str(settings, "qbittorrent.password"));
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await testService.mutateAsync({
        service: "qbittorrent",
        values: { "qbittorrent.url": url, "qbittorrent.username": username, "qbittorrent.password": password },
      });
      if (!result.connected) {
        toast.error("Connection failed. Check your URL and credentials.");
        return;
      }
      await setMany.mutateAsync({
        settings: [
          { key: "qbittorrent.url", value: url },
          { key: "qbittorrent.username", value: username },
          { key: "qbittorrent.password", value: password },
          { key: "qbittorrent.enabled", value: true },
        ],
      });
      toast.success("Connected to qBittorrent");
      onNext();
    } catch {
      toast.error("Failed to connect to qBittorrent");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    configureFooter({ onPrimary: () => void handleSave(), primaryLabel: "Connect & continue", primaryDisabled: !url, primaryLoading: testing, onSkip });
  }, [url, username, password, testing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <ServiceLogo brand="qbittorrent" alt="qBittorrent" />
      <StepHeader
        title="Download Client"
        description="Connect your torrent client so Canto can send downloads and manage files automatically. Just point us to the WebUI — Canto handles the rest."
      />
      <p className="text-sm text-muted-foreground">
        Currently supported: <span className="text-foreground">qBittorrent</span>. More clients coming soon.
      </p>

      <div className="w-full max-w-md space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="WebUI URL (e.g. http://localhost:8080)" variant="ghost" />
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" variant="ghost" />
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" variant="ghost" />
      </div>
    </div>
  );
}
