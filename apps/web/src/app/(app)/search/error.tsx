"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StateMessage } from "@canto/ui/state-message";

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    console.error("Search error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <StateMessage
        preset="errorSearch"
        onRetry={reset}
        action={{ label: "Go home", onClick: () => router.push("/") }}
        minHeight="0px"
      />
    </div>
  );
}
