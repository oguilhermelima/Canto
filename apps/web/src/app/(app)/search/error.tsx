"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@canto/ui/button";
import { AlertTriangle } from "lucide-react";

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("Search error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Search failed
        </h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          Something went wrong while searching. Please try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
