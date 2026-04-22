"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@canto/ui/button";
import { FieldInput } from "@/components/settings/_primitives";
import { SectionCard, SettingsSection } from "@/components/settings/shared";
import { trpc } from "@/lib/trpc/client";
import {
  SETTINGS_REGISTRY,
  type SettingKey,
} from "@canto/db/settings-registry";

const TRAKT_KEYS = [
  "trakt.clientId",
  "trakt.clientSecret",
] as const;

export function TraktSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: async () => {
      await utils.settings.getAll.invalidate();
    },
  });

  const [values, setValues] = useState<Record<(typeof TRAKT_KEYS)[number], string>>({
    "trakt.clientId": "",
    "trakt.clientSecret": "",
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!allSettings) return;
    setValues({
      "trakt.clientId": (allSettings["trakt.clientId"] as string | undefined) ?? "",
      "trakt.clientSecret": (allSettings["trakt.clientSecret"] as string | undefined) ?? "",
    });
    setDirty(false);
  }, [allSettings]);

  const handleSave = (): void => {
    setMany.mutate(
      {
        settings: TRAKT_KEYS.map((key) => ({ key, value: values[key] })),
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Trakt settings saved");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  return (
    <SettingsSection
      title="Trakt"
      description="Configure the OAuth application credentials used to connect user Trakt accounts."
    >
      <SectionCard title="Trakt">
        <div className="space-y-5 px-5 py-5">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Create an OAuth app in Trakt and paste the credentials here. Users will then connect in{" "}
              <strong>Preferences → Connections</strong>.
            </p>
            <a
              href="https://trakt.tv/oauth/applications"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Trakt OAuth applications
            </a>
          </div>

          <div className="space-y-4">
            {TRAKT_KEYS.map((key) => {
              const def = SETTINGS_REGISTRY[key as SettingKey];
              return (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">
                    {def.label}
                  </label>
                  <FieldInput
                    inputType={def.inputType}
                    value={values[key]}
                    placeholder={key === "trakt.clientId" ? "Your Trakt client id" : "Your Trakt client secret"}
                    onChange={(next) => {
                      setValues((prev) => ({
                        ...prev,
                        [key]: typeof next === "string" ? next : "",
                      }));
                      setDirty(true);
                    }}
                    disabled={isLoading || setMany.isPending}
                  />
                  {def.help ? (
                    <p className="text-xs text-muted-foreground">{def.help}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              className="rounded-xl"
              onClick={handleSave}
              disabled={!dirty || setMany.isPending}
            >
              {setMany.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </SectionCard>
    </SettingsSection>
  );
}
