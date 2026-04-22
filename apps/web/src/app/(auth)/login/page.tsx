"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { FormField } from "@canto/ui/form-field";
import { PasswordInput } from "@canto/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { useDocumentTitle } from "@/hooks/use-document-title";

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

  useDocumentTitle("Login");

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
        <FormField label="Email" htmlFor="email" className="space-y-2">
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={loading}
            variant="ghost"
          />
        </FormField>
        <FormField label="Password" htmlFor="password" className="space-y-2">
          <PasswordInput
            id="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={loading}
            variant="ghost"
          />
        </FormField>
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
