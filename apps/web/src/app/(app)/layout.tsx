"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { Topbar } from "~/components/layout/topbar";
import { BottomNavbar } from "~/components/layout/bottom-navbar";
import { trpc } from "~/lib/trpc/client";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const { data: isOnboarded, isLoading } = trpc.settings.isOnboardingCompleted.useQuery();

  useEffect(() => {
    if (!isLoading && isOnboarded === false) {
      router.replace("/onboarding");
    }
  }, [isOnboarded, isLoading, router]);

  // Don't flash app chrome while checking onboarding
  if (isLoading || isOnboarded === false) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <BottomNavbar />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">{children}</main>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--color-foreground)",
            color: "var(--color-background)",
            borderRadius: "9999px",
            boxShadow:
              "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            border: "none",
            padding: "12px 20px",
          },
        }}
      />
    </div>
  );
}
