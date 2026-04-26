"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ORIGIN_KEY = "canto.nav.origin";

/**
 * Records the first pathname of the current tab session into sessionStorage.
 * Mount once at the app layout. Used by `useGoBack` to know whether the user
 * has actually navigated within the app vs. landed cold on a deep link.
 */
export function useTrackNavigationOrigin(): void {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(ORIGIN_KEY)) {
        sessionStorage.setItem(ORIGIN_KEY, pathname);
      }
    } catch {
      // sessionStorage unavailable — accept the degraded behavior
    }
  }, [pathname]);
}

function deriveParent(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

/**
 * Returns a back-navigation handler that uses real browser history when the
 * user has navigated within the app, and falls back to a parent route on
 * cold deep-link entries.
 *
 * - If current pathname differs from the recorded session origin, `router.back()`.
 * - Otherwise, `router.push(fallback)`. Defaults to the parent of the current
 *   pathname (e.g. `/library/upcoming` → `/library`).
 */
export function useGoBack(fallback?: string): () => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(() => {
    const target = fallback ?? deriveParent(pathname);
    let origin: string | null = null;
    try {
      origin = sessionStorage.getItem(ORIGIN_KEY);
    } catch {
      // ignore
    }

    if (origin && origin !== pathname) {
      router.back();
    } else {
      router.push(target);
    }
  }, [router, pathname, fallback]);
}
