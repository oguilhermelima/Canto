"use client";

import { useEffect } from "react";
import { Button } from "@canto/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Something went wrong
        </h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          An unexpected error occurred. Please try again or return to the home
          page.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
