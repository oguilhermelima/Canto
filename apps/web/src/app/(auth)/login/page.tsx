"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, LogIn, Eye, EyeOff } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Label } from "@canto/ui/label";
import { authClient } from "~/lib/auth-client";

const inputCn =
  "bg-accent rounded-xl border-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0";

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.title = "Login — Canto";
  }, []);

  // On very first visit (middleware redirect), go to register if no users exist yet.
  // Skip if user navigated here from another page (clicked "Sign in" link).
  useEffect(() => {
    const isDirectAccess = !document.referrer || !document.referrer.includes(window.location.origin);
    if (!isDirectAccess) return;

    let cancelled = false;
    fetch("/api/trpc/settings.isOnboardingCompleted")
      .then((r) => r.json())
      .then((data: { result?: { data?: { json?: boolean } } }) => {
        if (!cancelled && data.result?.data?.json === false) {
          router.replace("/register");
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Failed to sign in");
        return;
      }

      const callbackUrl = searchParams.get("callbackUrl");
      const redirect = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
      router.push(redirect);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Good to see you again</h1>
        <p className="text-sm text-muted-foreground">
          Pick up right where you left off
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={loading}
            className={inputCn}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
              className={`${inputCn} pr-10`}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          className="w-full rounded-xl"
          size="lg"
          disabled={loading || !email || !password}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
