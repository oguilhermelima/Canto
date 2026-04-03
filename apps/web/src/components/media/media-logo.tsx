"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";

interface MediaLogoProps {
  src: string;
  alt: string;
  /** Size preset — controls the max-h / max-w constraints. */
  size?: "hero" | "carousel" | "spotlight";
  className?: string;
}

const DROP_SHADOW =
  "drop-shadow(0 0 2px rgba(255,255,255,0.8)) drop-shadow(0 0 8px rgba(255,255,255,0.3)) drop-shadow(0 2px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 24px rgba(0,0,0,0.4))";

type Variant = "normal" | "tall" | "extreme";

const SIZE_CLASSES: Record<string, Record<Variant, string>> = {
  hero: {
    normal: "max-h-20 sm:max-h-22 md:max-h-22 lg:max-h-24 xl:max-h-26 2xl:max-h-28",
    tall: "max-h-32 sm:max-h-36 md:max-h-38 lg:max-h-40 xl:max-h-44 2xl:max-h-48",
    extreme: "max-h-40 sm:max-h-44 md:max-h-48 lg:max-h-52 xl:max-h-56 2xl:max-h-60",
  },
  spotlight: {
    normal: "max-h-20 sm:max-h-22 md:max-h-24 lg:max-h-26 xl:max-h-28 2xl:max-h-32",
    tall: "max-h-32 sm:max-h-40 md:max-h-42 lg:max-h-44 xl:max-h-48 2xl:max-h-52",
    extreme: "max-h-40 sm:max-h-48 md:max-h-52 lg:max-h-56 xl:max-h-60 2xl:max-h-64",
  },
  carousel: {
    normal: "max-h-20 max-w-[260px]",
    tall: "max-h-36 max-w-[200px]",
    extreme: "max-h-44 max-w-[180px]",
  },
};

function detectVariant(width: number, height: number): Variant {
  const ratio = width / height;
  if (ratio < 0.8) return "extreme";
  if (ratio < 1.2) return "tall";
  return "normal";
}

export function MediaLogo({ src, alt, size = "hero", className }: MediaLogoProps): React.JSX.Element {
  const [variant, setVariant] = useState<Variant>("normal");

  const classes = SIZE_CLASSES[size]!;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn(
        "h-auto w-auto object-contain object-left",
        classes[variant],
        className,
      )}
      style={{ filter: DROP_SHADOW }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setVariant(detectVariant(img.naturalWidth, img.naturalHeight));
        }
      }}
    />
  );
}
