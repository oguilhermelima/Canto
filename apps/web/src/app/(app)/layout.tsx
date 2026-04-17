"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { Topbar } from "~/components/layout/topbar";
import { BottomNavbar } from "~/components/layout/bottom-navbar";
import { trpc } from "~/lib/trpc/client";

const SYNC_DEBOUNCE_MS = 30_000;
const SCROLL_IDLE_MS = 120;

function useReverseSyncOnFocus(): void {
  const syncNow = trpc.userConnection.syncNow.useMutation();
  const lastRunRef = useRef(0);
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    triggerRef.current = () => {
      const now = Date.now();
      if (now - lastRunRef.current < SYNC_DEBOUNCE_MS) return;
      lastRunRef.current = now;
      syncNow.mutate();
    };
  });

  useEffect(() => {
    const fire = (): void => triggerRef.current();
    fire();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", fire);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", fire);
    };
  }, []);
}

/**
 * While any scroll is active (page or any nested scroll container), add
 * `is-scrolling` to <html>. Paired with CSS in globals.css, this pauses
 * transitions so hover effects don't flicker as cards move under the cursor.
 */
function useScrollPauseClass(): void {
  useEffect(() => {
    const root = document.documentElement;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onScroll = (): void => {
      root.classList.add("is-scrolling");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        root.classList.remove("is-scrolling");
      }, SCROLL_IDLE_MS);
    };

    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("scroll", onScroll, { capture: true });
      root.classList.remove("is-scrolling");
    };
  }, []);
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  useReverseSyncOnFocus();
  useScrollPauseClass();

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
