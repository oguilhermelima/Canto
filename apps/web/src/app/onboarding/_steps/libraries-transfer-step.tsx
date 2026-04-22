"use client";

import { useState, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import { Wand2, Link2, MonitorSmartphone, ShieldCheck, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import { StepHeader } from "../_components/step-header";

export function LibrariesTransferStep({
  onNext,
  onSkip,
  configureFooter,
}: {
  onNext: () => void;
  onSkip: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [importMethod, setImportMethod] = useState<"local" | "remote">("local");
  const setDownloadSettings = trpc.library.setDownloadSettings.useMutation();

  const handleContinue = (): void => {
    setDownloadSettings.mutate({
      importMethod,
      seedRatioLimit: null,
      seedTimeLimitHours: null,
      seedCleanupFiles: true,
    });
    onNext();
  };

  useEffect(() => {
    configureFooter({ onPrimary: handleContinue, primaryLoading: setDownloadSettings.isPending, onSkip });
  }, [importMethod, setDownloadSettings.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-10 text-center pt-16 md:pt-0">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Wand2 className="h-8 w-8 text-primary" />
      </div>
      <StepHeader
        title="Organization method"
        description={
          <>
            How should Canto organize files from the <strong className="text-blue-400">download path</strong> into the <strong className="text-emerald-400">library path</strong>?
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 text-left">
        {/* Hardlink option */}
        <button
          type="button"
          onClick={() => setImportMethod("local")}
          className={cn(
            "rounded-2xl border p-6 text-left transition-all",
            importMethod === "local"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/10",
          )}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Link2 className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-foreground">Hardlink</p>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Recommended</span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Think of it as a shortcut — the same file shows up in both your download and library folders,
                but only takes up space once on your disk. The safest way to keep your library intact.
              </p>
              <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-foreground"><strong>Library stays intact</strong> — even if you delete the torrent, the file remains in your library</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-foreground"><strong>Zero extra disk space</strong> — same data, two locations</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-foreground"><strong>Seeding never interrupted</strong> — safe for private trackers</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-muted-foreground">Requires Canto and qBittorrent on the same filesystem and disk</span>
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* API option */}
        <button
          type="button"
          onClick={() => setImportMethod("remote")}
          className={cn(
            "rounded-2xl border p-6 text-left transition-all",
            importMethod === "remote"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/10",
          )}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
              <MonitorSmartphone className="h-5 w-5 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-foreground">qBittorrent API</p>
                <span className="rounded-lg bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Remote</span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Canto sends instructions to qBittorrent over the network to move and rename files for you.
                Best when qBittorrent runs on a different machine or container than Canto.
              </p>
              <div className="mt-3 space-y-2.5 border-t border-border pt-3">
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-foreground"><strong>Works across machines</strong> — no shared filesystem or storage needed</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-foreground"><strong>No extra disk space</strong> — files are moved, not copied</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-muted-foreground"><strong>Removing a torrent also removes the library file</strong> — there's only one copy</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-muted-foreground"><strong>May break seeding</strong> — renaming files can cause issues on private trackers</span>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
