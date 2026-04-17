"use client";

import { useSyncExternalStore } from "react";

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1280;

export interface ResponsivePageSizeConfig {
  mobile: number;
  tablet: number;
  desktop: number;
  ssr?: number;
}

type Listener = () => void;

function subscribe(listener: Listener): () => void {
  if (typeof window === "undefined") return () => undefined;
  const tablet = window.matchMedia(`(min-width: ${TABLET_BREAKPOINT}px)`);
  const desktop = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
  tablet.addEventListener("change", listener);
  desktop.addEventListener("change", listener);
  return () => {
    tablet.removeEventListener("change", listener);
    desktop.removeEventListener("change", listener);
  };
}

function getBreakpoint(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "mobile";
  if (window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`).matches) return "desktop";
  if (window.matchMedia(`(min-width: ${TABLET_BREAKPOINT}px)`).matches) return "tablet";
  return "mobile";
}

export function useResponsivePageSize(cfg: ResponsivePageSizeConfig): number {
  const getSnapshot = (): number => {
    const bp = getBreakpoint();
    return cfg[bp];
  };
  const getServerSnapshot = (): number => cfg.ssr ?? cfg.mobile;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
