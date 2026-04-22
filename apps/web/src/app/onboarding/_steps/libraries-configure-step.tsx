"use client";

import { useEffect } from "react";
import { Folder } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../_components/onboarding-footer";
import { StepHeader } from "../_components/step-header";
import { DownloadFolders } from "@/components/settings/download-folders";

export function LibrariesConfigureStep({
  onNext,
  onSkip,
  configureFooter,
}: {
  onNext: () => void;
  onSkip: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  useEffect(() => {
    configureFooter({ onPrimary: onNext, onSkip });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dlSettingsQuery = trpc.library.getDownloadSettings.useQuery();
  const importMethod = dlSettingsQuery.data?.importMethod ?? "local";

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Folder className="h-8 w-8 text-primary" />
      </div>
      <StepHeader
        title="Configure your libraries"
        description={
          <>
            Set the <strong className="text-blue-400">download</strong> and <strong className="text-emerald-400">library</strong> paths for each library.
          </>
        }
      />

      <div className="w-full max-w-2xl text-left">
        <DownloadFolders mode="onboarding" importMethod={importMethod} />
      </div>
    </div>
  );
}
