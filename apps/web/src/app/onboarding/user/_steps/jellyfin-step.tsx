"use client";

import { useState, useEffect } from "react";
import { Input } from "@canto/ui/input";
import { PasswordInput } from "@canto/ui/password-input";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import type { ConfigureFooter } from "../../_components/onboarding-footer";
import { ServiceLogo } from "../../_components/service-logo";
import { StepHeader } from "../../_components/step-header";

type AuthMode = "reuse" | "own";

export function JellyfinUserStep({
  onNext,
  alreadyConnected,
  configureFooter,
}: {
  onNext: () => void;
  alreadyConnected: boolean;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const [authMode, setAuthMode] = useState<AuthMode>("reuse");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(alreadyConnected);
  const [testing, setTesting] = useState(false);

  const addConnection = trpc.userConnection.add.useMutation();
  const reuseAdmin = trpc.userConnection.reuseAdminCreds.useMutation();

  const handleReuse = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await reuseAdmin.mutateAsync({ provider: "jellyfin" });
      if (result.success) {
        setConnected(true);
        toast.success("Linked to the server's Jellyfin account");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to link account";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleOwn = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await addConnection.mutateAsync({
        provider: "jellyfin",
        username,
        password,
      });
      if (result.success) {
        setConnected(true);
        toast.success("Connected to Jellyfin");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect to Jellyfin";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const canSubmitOwn = username && password;

  useEffect(() => {
    const primary = connected ? onNext : authMode === "reuse" ? handleReuse : handleOwn;
    configureFooter({
      onPrimary: primary,
      primaryLabel: connected ? "Continue" : authMode === "reuse" ? "Use this account" : "Connect & continue",
      primaryDisabled: !connected && authMode === "own" && (testing || !canSubmitOwn),
      primaryLoading: testing,
      onSkip: connected ? undefined : onNext,
    });
  }, [connected, authMode, testing, username, password]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center pt-16 md:pt-0">
      <ServiceLogo brand="jellyfin" alt="Jellyfin" />
      <StepHeader
        title="Jellyfin"
        description="Link your Jellyfin account. You can reuse the server's admin account or sign in with your own."
      />

      {connected ? (
        <div className="w-full max-w-md space-y-3">
          <div className="rounded-xl bg-muted/30 px-6 py-5 text-sm text-muted-foreground">
            Your Jellyfin account is linked.
          </div>
          <button
            type="button"
            onClick={() => {
              setConnected(false);
              setUsername("");
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
              Use server's account
            </button>
            <button type="button" onClick={() => setAuthMode("own")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "own" ? "bg-background text-foreground" : "text-muted-foreground")}>
              Sign in with mine
            </button>
          </div>
          {authMode === "reuse" ? (
            <div className="rounded-xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground text-left">
              Canto will link you to the Jellyfin account the admin configured. Watch progress
              and library access will match that account.
            </div>
          ) : (
            <>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Jellyfin username" variant="ghost" />
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Jellyfin password" variant="ghost" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
