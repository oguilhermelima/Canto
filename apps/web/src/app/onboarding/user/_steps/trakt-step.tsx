"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../../_components/onboarding-footer";
import { ServiceLogo } from "../../_components/service-logo";
import { StepHeader } from "../../_components/step-header";

export function TraktUserStep({
  onNext,
  alreadyConnected,
  configureFooter,
}: {
  onNext: () => void;
  alreadyConnected: boolean;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [userCode, setUserCode] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [polling, setPolling] = useState(false);
  const [pollInterval, setPollInterval] = useState(5000);
  const [connected, setConnected] = useState(alreadyConnected);

  const createDevice = trpc.userConnection.traktDeviceCreate.useMutation();
  const checkDevice = trpc.userConnection.traktDeviceCheck.useQuery(
    { deviceCode: deviceCode ?? "" },
    { enabled: polling && deviceCode !== null, refetchInterval: pollInterval, retry: false },
  );

  useEffect(() => {
    if (!polling) return;
    const id = setTimeout(() => {
      setPolling(false);
      setDeviceCode(null);
      toast.error("Trakt authorization timed out — try again");
    }, 10 * 60 * 1000);
    return () => clearTimeout(id);
  }, [polling]);

  useEffect(() => {
    const data = checkDevice.data;
    if (!data) return;
    if (data.authenticated) {
      setPolling(false);
      setDeviceCode(null);
      setConnected(true);
      toast.success("Trakt account linked");
    } else if (data.expired) {
      setPolling(false);
      setDeviceCode(null);
      toast.error("Trakt authorization expired");
    }
  }, [checkDevice.data]);

  const handleStart = (): void => {
    createDevice.mutate(undefined, {
      onSuccess: (data) => {
        setDeviceCode(data.device_code);
        setUserCode(data.user_code);
        setVerificationUrl(data.verification_url);
        setPollInterval(Math.max(2_000, data.interval * 1_000));
        setPolling(true);
        const directUrl = `${data.verification_url.replace(/\/$/, "")}/${encodeURIComponent(data.user_code)}`;
        window.open(directUrl, "trakt-auth", "width=600,height=700");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  useEffect(() => {
    configureFooter({
      onPrimary: connected ? onNext : undefined,
      primaryLabel: "Continue",
      onSkip: connected ? undefined : onNext,
    });
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo src="/trakt-logo.svg" alt="Trakt" />
      <StepHeader
        title="Trakt"
        description="Link your Trakt account to sync watch history across all the apps you use."
      />

      {connected ? (
        <div className="w-full max-w-md rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
          Your Trakt account is linked.
        </div>
      ) : polling && userCode ? (
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-xl bg-muted/30 px-6 py-5 space-y-3">
            <p className="text-xs text-muted-foreground">Enter this code on Trakt</p>
            <p className="text-2xl font-mono font-semibold tracking-widest text-foreground">
              {userCode}
            </p>
            <a
              href={`${verificationUrl.replace(/\/$/, "")}/${encodeURIComponent(userCode)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              Open Trakt authorization page <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for authorization…
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={handleStart}
          disabled={createDevice.isPending}
          className="w-full max-w-md rounded-xl gap-2"
        >
          {createDevice.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ServiceLogo src="/trakt-logo.svg" alt="" size={16} />
          )}
          Connect Trakt
        </Button>
      )}
    </div>
  );
}
