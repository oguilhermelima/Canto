"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { PasswordInput } from "@canto/ui/password-input";
import { Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { ConfigureFooter } from "../../_components/onboarding-footer";
import { ServiceLogo } from "../../_components/service-logo";
import { StepHeader } from "../../_components/step-header";

type AuthMode = "reuse" | "oauth" | "email";

export function PlexUserStep({
  onNext,
  alreadyConnected,
  configureFooter,
}: {
  onNext: () => void;
  alreadyConnected: boolean;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [authMode, setAuthMode] = useState<AuthMode>("reuse");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [polling, setPolling] = useState(false);
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const [connected, setConnected] = useState(alreadyConnected);
  const [testing, setTesting] = useState(false);

  const addConnection = trpc.userConnection.add.useMutation();
  const reuseAdmin = trpc.userConnection.reuseAdminCreds.useMutation();
  const createPlexPin = trpc.userConnection.plexPinCreate.useMutation();
  const plexPinCheck = trpc.userConnection.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "" },
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
    if (plexPinCheck.data?.authenticated) {
      setPolling(false);
      setPinData(null);
      setConnected(true);
      toast.success(plexPinCheck.data.serverName ? `Connected to ${plexPinCheck.data.serverName}` : "Plex account linked");
    }
    if (plexPinCheck.data?.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Authentication session expired");
    }
  }, [plexPinCheck.data]);

  const handleReuse = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await reuseAdmin.mutateAsync({ provider: "plex" });
      if (result.success) {
        setConnected(true);
        toast.success("Linked to the server's Plex account");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to link account";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleOAuth = (): void => {
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
    setTesting(true);
    try {
      const result = await addConnection.mutateAsync({
        provider: "plex",
        credentials: { mode: "email", email, password },
      });
      if (result.success) {
        setConnected(true);
        toast.success("Plex account linked");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection failed";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const canSubmitEmail = email && password;

  useEffect(() => {
    const primary = connected
      ? onNext
      : authMode === "reuse"
        ? handleReuse
        : authMode === "email"
          ? handleEmail
          : undefined;
    configureFooter({
      onPrimary: primary,
      primaryLabel: connected
        ? "Continue"
        : authMode === "reuse"
          ? "Use this account"
          : "Connect & continue",
      primaryDisabled: !connected && authMode === "email" && (testing || !canSubmitEmail),
      primaryLoading: testing,
      onSkip: connected ? undefined : onNext,
    });
  }, [connected, authMode, testing, email, password]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="plex" alt="Plex" />
      <StepHeader
        title="Plex"
        description="Link your Plex account. You can reuse the server's admin account or sign in with your own."
      />

      {connected ? (
        <div className="w-full max-w-md space-y-3">
          <div className="rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
            Your Plex account is linked.
          </div>
          <button
            type="button"
            onClick={() => {
              setConnected(false);
              setEmail("");
              setPassword("");
              setAuthMode("reuse");
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Use a different account
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <div className="flex rounded-xl bg-accent p-1">
            <button type="button" onClick={() => setAuthMode("reuse")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "reuse" ? "bg-background text-foreground" : "text-muted-foreground")}>
              Server's account
            </button>
            <button type="button" onClick={() => setAuthMode("oauth")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "oauth" ? "bg-background text-foreground" : "text-muted-foreground")}>
              Sign in
            </button>
            <button type="button" onClick={() => setAuthMode("email")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "email" ? "bg-background text-foreground" : "text-muted-foreground")}>
              Email
            </button>
          </div>
          {authMode === "reuse" && (
            <div className="rounded-xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground text-left">
              Canto will link you to the Plex account the admin configured. Watch progress and
              library access will match that account.
            </div>
          )}
          {authMode === "oauth" && (
            <Button
              variant="outline"
              onClick={handleOAuth}
              disabled={polling || createPlexPin.isPending}
              className="w-full rounded-xl gap-2"
            >
              {(polling || createPlexPin.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ServiceLogo brand="plex" alt="" size={16} />
              )}
              {polling ? "Waiting for Plex..." : "Sign in with Plex"}
            </Button>
          )}
          {authMode === "email" && (
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
