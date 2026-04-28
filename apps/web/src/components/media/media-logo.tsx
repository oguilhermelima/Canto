"use client";

import { cn } from "@canto/ui/cn";

interface MediaLogoProps {
  src: string;
  alt: string;
  /** Size preset — controls the fixed height and (for cards) max-width. */
  size?: "hero" | "carousel" | "spotlight" | "card";
  className?: string;
}

const DROP_SHADOW =
  "drop-shadow(0 0 1px rgba(255,255,255,0.5)) drop-shadow(0 0 3px rgba(255,255,255,0.15)) drop-shadow(0 1px 4px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(0,0,0,0.3))";

// Fixed heights per size preset. Reserves vertical space before the image
// loads so the surrounding layout doesn't shift when the logo finally arrives
// (the previous variant-on-load adjustment caused two consecutive shifts on
// slow connections — visible most painfully on mobile).
const SIZE_CLASSES: Record<string, string> = {
  hero: "h-20 sm:h-22 md:h-22 lg:h-24 xl:h-26 2xl:h-28",
  spotlight: "h-28 sm:h-32 md:h-36 lg:h-40 xl:h-44 2xl:h-48",
  carousel: "h-20 max-w-[260px]",
  card: "h-12 max-w-[200px]",
};

export function MediaLogo({ src, alt, size = "hero", className }: MediaLogoProps): React.JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn(
        "w-auto max-w-full object-contain object-left",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ filter: DROP_SHADOW }}
    />
  );
}
