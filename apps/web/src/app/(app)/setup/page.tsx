"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";

export default function SetupPage(): React.JSX.Element {
  useDocumentTitle("Setting up");
  const router = useRouter();

  const { data, isSuccess } = trpc.homeSection.list.useQuery(undefined, {
    refetchInterval: 1000,
  });

  useEffect(() => {
    if (isSuccess && data.sections.length > 0) {
      // Brief delay for the animation to play
      const timeout = setTimeout(() => {
        router.replace("/");
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isSuccess, data, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-4 animate-[fadeIn_0.5s_ease-out]">
        <Image
          src="/canto.svg"
          alt="Canto"
          width={64}
          height={64}
          className="h-16 w-16 animate-pulse dark:invert"
        />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Setting up your Canto
        </h1>
        <p className="text-sm text-muted-foreground">
          Preparing your personalized homepage...
        </p>
      </div>
    </div>
  );
}
