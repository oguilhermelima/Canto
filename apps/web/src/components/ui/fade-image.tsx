"use client";

import Image from "next/image";
import type {ImageProps} from "next/image";
import { useState, useCallback, useRef } from "react";
import { cn } from "@canto/ui/cn";

interface FadeImageProps extends ImageProps {
  /** Duration of fade-in transition in ms (default 500) */
  fadeDuration?: number;
  /** Number of retries on error (default 2) */
  retryCount?: number;
}

export function FadeImage({
  fadeDuration = 500,
  retryCount = 2,
  className,
  onLoad,
  onError,
  src,
  ...rest
}: FadeImageProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const retriesRef = useRef(0);
  const [cacheBust, setCacheBust] = useState(0);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(e);
    },
    [onLoad],
  );

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (retriesRef.current < retryCount) {
        retriesRef.current += 1;
        setCacheBust(retriesRef.current);
      } else {
        onError?.(e);
      }
    },
    [retryCount, onError],
  );

  // Append cache-bust param for retries (only for string srcs)
  const resolvedSrc =
    cacheBust > 0 && typeof src === "string"
      ? `${src}${src.includes("?") ? "&" : "?"}cb=${cacheBust}`
      : src;

  return (
    <Image
      {...rest}
      src={resolvedSrc}
      className={cn(
        "transition-opacity",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{
        ...(rest.style),
        transitionDuration: `${fadeDuration}ms`,
      }}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
