"use client";

import { Toaster } from "sonner";
import { Topbar } from "~/components/layout/topbar";
import { BottomNavbar } from "~/components/layout/bottom-navbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {

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
