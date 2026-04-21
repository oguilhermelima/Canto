"use client";

import { useState, useEffect } from "react";
import { Input } from "@canto/ui/input";
import { PasswordInput } from "@canto/ui/password-input";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import type { Settings } from "../_components/constants";
import { str } from "../_components/constants";
import { ServiceLogo } from "../_components/service-logo";
import { StepHeader } from "../_components/step-header";

export function TraktStep({
  onNext,
  settings,
  configureFooter,
}: {
  onNext: () => void;
  settings?: Settings;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [clientId, setClientId] = useState(str(settings, "trakt.clientId"));
  const [clientSecret, setClientSecret] = useState(str(settings, "trakt.clientSecret"));
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();
  const saveSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });

  const canSubmit = clientId && clientSecret;

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveSettings.mutateAsync({
        settings: [
          { key: "trakt.clientId", value: clientId },
          { key: "trakt.clientSecret", value: clientSecret },
        ],
      });
      toast.success("Trakt credentials saved");
      onNext();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save Trakt credentials";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    configureFooter({
      onPrimary: () => void handleSave(),
      primaryLabel: "Save & continue",
      primaryDisabled: !canSubmit || saving,
      primaryLoading: saving,
      onSkip: onNext,
    });
  }, [clientId, clientSecret, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo src="/trakt-logo.svg" alt="Trakt" />
      <StepHeader
        title="Trakt"
        description={
          <>
            Enable Trakt sync for your users. Create an OAuth application at{" "}
            <a
              href="https://trakt.tv/oauth/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              trakt.tv/oauth/applications
            </a>{" "}
            and paste the credentials below.
          </>
        }
      />

      <div className="w-full max-w-md space-y-3">
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID"
          variant="ghost"
        />
        <PasswordInput
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client Secret"
          variant="ghost"
        />
      </div>
    </div>
  );
}
