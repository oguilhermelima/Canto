"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { MagicSetup } from "@/components/onboarding/magic-setup";

export default function SetupPage(): React.JSX.Element {
  useDocumentTitle("Setting up");
  const router = useRouter();

  const { data, isSuccess } = trpc.homeSection.list.useQuery(undefined, {
    refetchInterval: 1000,
  });

  useEffect(() => {
    if (isSuccess && data.sections.length > 0) {
      const timeout = setTimeout(() => {
        router.replace("/");
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isSuccess, data, router]);

  return (
    <MagicSetup
      title="Estamos preparando sua experiência"
      subtitle="Terminando alguns ajustes finais para você ter a melhor experiência possível."
    />
  );
}
