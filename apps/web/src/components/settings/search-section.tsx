"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { SettingsSection } from "./shared";

const KEYS = {
  maxIndexers: "search.maxIndexers",
  timeout: "search.timeout",
  concurrency: "search.concurrency",
} as const;

const DEFAULTS = {
  maxIndexers: 10,
  timeout: 15000,
  concurrency: 5,
};

export function SearchSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => {
      void utils.settings.getAll.invalidate();
      toast.success("Search settings saved");
      setDirty(false);
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const [maxIndexers, setMaxIndexers] = useState(DEFAULTS.maxIndexers);
  const [timeout, setTimeout_] = useState(DEFAULTS.timeout);
  const [concurrency, setConcurrency] = useState(DEFAULTS.concurrency);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!allSettings) return;
    setMaxIndexers((allSettings[KEYS.maxIndexers] as number) ?? DEFAULTS.maxIndexers);
    setTimeout_((allSettings[KEYS.timeout] as number) ?? DEFAULTS.timeout);
    setConcurrency((allSettings[KEYS.concurrency] as number) ?? DEFAULTS.concurrency);
    setDirty(false);
  }, [allSettings]);

  const handleSave = (): void => {
    setMany.mutate({
      settings: [
        { key: KEYS.maxIndexers, value: maxIndexers },
        { key: KEYS.timeout, value: timeout },
        { key: KEYS.concurrency, value: concurrency },
      ],
    });
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <SettingsSection
        title="Indexer Limits"
        description="Control how many indexers are queried and how long to wait for results. Lower values mean faster searches."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Max Indexers per Search
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Maximum number of indexers to query simultaneously. You have 20 indexers configured — using fewer means faster results.
            </p>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxIndexers}
              onChange={(e) => { setMaxIndexers(parseInt(e.target.value, 10) || DEFAULTS.maxIndexers); setDirty(true); }}
              className="w-32 rounded-xl"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Timeout per Indexer (ms)
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              How long to wait for each indexer before skipping it. Slow indexers hold up results.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={3000}
                max={60000}
                step={1000}
                value={timeout}
                onChange={(e) => { setTimeout_(parseInt(e.target.value, 10) || DEFAULTS.timeout); setDirty(true); }}
                className="w-32 rounded-xl"
              />
              <span className="text-xs text-muted-foreground">{(timeout / 1000).toFixed(0)}s</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Concurrency
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              How many indexers to query at the same time. Higher values are faster but put more load on Prowlarr.
            </p>
            <Input
              type="number"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => { setConcurrency(parseInt(e.target.value, 10) || DEFAULTS.concurrency); setDirty(true); }}
              className="w-32 rounded-xl"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={!dirty || setMany.isPending}
          className="mt-2 gap-2 rounded-xl"
        >
          {setMany.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
      </SettingsSection>
    </div>
  );
}
