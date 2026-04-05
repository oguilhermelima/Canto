"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StateMessage } from "~/components/layout/state-message";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <StateMessage
        preset="error"
        onRetry={reset}
        action={{ label: "Go home", onClick: () => router.push("/") }}
        minHeight="0px"
      />
    </div>
  );
}
