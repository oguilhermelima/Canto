"use client";

import { useCallback, useRef, useState } from "react";
import { Heart, HeartOff } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "@/lib/trpc/client";

// ── Floating hearts particle ──

function spawnHearts(container: HTMLElement): void {
  const count = 6;
  for (let i = 0; i < count; i++) {
    const heart = document.createElement("span");
    heart.textContent = "♥";
    heart.className = "favorite-particle";
    // Random spread: -20px to +20px horizontal, always float up
    const x = (Math.random() - 0.5) * 40;
    const delay = Math.random() * 120;
    const size = 10 + Math.random() * 8;
    heart.style.cssText = `
      position:absolute;left:50%;top:50%;
      pointer-events:none;
      font-size:${size}px;
      color:var(--color-red-500);
      opacity:1;
      transform:translate(-50%,-50%);
      animation:float-heart 700ms ${delay}ms ease-out forwards;
      --float-x:${x}px;
      z-index:50;
    `;
    container.appendChild(heart);
    setTimeout(() => heart.remove(), 900);
  }
}

// ── Keyframes injected once ──

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes float-heart {
      0%   { opacity:1; transform:translate(-50%,-50%) scale(0.4); }
      30%  { opacity:1; transform:translate(calc(-50% + var(--float-x) * 0.4), calc(-50% - 18px)) scale(1); }
      100% { opacity:0; transform:translate(calc(-50% + var(--float-x)), calc(-50% - 40px)) scale(0.6); }
    }
    @keyframes heart-pop {
      0%   { transform:scale(1); }
      40%  { transform:scale(1.3); }
      100% { transform:scale(1); }
    }
    @keyframes heart-shrink {
      0%   { transform:scale(1); opacity:1; }
      50%  { transform:scale(0.6); opacity:0.4; }
      100% { transform:scale(1); opacity:1; }
    }
  `;
  document.head.appendChild(style);
}

interface FavoriteButtonProps {
  mediaId: string;
  isFavorite: boolean;
}

export function FavoriteButton({ mediaId, isFavorite: initialFavorite }: FavoriteButtonProps) {
  const utils = trpc.useUtils();
  const [optimistic, setOptimistic] = useState(initialFavorite);
  const [isHovered, setIsHovered] = useState(false);
  const [animating, setAnimating] = useState<"add" | "remove" | null>(null);
  const containerRef = useRef<HTMLButtonElement>(null);

  const mutation = trpc.userMedia.toggleFavorite.useMutation({
    onMutate: () => {
      setOptimistic((prev) => !prev);
    },
    onError: () => {
      setOptimistic(initialFavorite);
    },
    onSettled: () => {
      void utils.userMedia.getState.invalidate({ mediaId });
      void utils.userMedia.getUserMediaCounts.invalidate();
      void utils.userMedia.getUserMedia.invalidate();
    },
  });

  // Sync with server state when prop changes
  if (initialFavorite !== optimistic && !mutation.isPending) {
    setOptimistic(initialFavorite);
  }

  const handleClick = useCallback(() => {
    injectStyles();
    const wasFavorite = optimistic;

    if (!wasFavorite && containerRef.current) {
      spawnHearts(containerRef.current);
      setAnimating("add");
    } else {
      setAnimating("remove");
    }

    setTimeout(() => setAnimating(null), 700);
    mutation.mutate({ mediaId, isFavorite: !wasFavorite });
  }, [optimistic, mediaId, mutation]);

  // Show HeartOff on hover when favorited
  const showBreakHeart = optimistic && isHovered && animating !== "add";

  return (
    <button
      ref={containerRef}
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={mutation.isPending}
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-xl border backdrop-blur-md transition-all",
        optimistic
          ? isHovered
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-red-500/40 bg-red-500/15 text-red-500"
          : "border-foreground/20 bg-foreground/15 text-foreground hover:bg-foreground/25 hover:text-foreground",
      )}
      aria-label={optimistic ? "Remove from favorites" : "Add to favorites"}
    >
      {showBreakHeart ? (
        <HeartOff className="h-5 w-5 transition-all" />
      ) : (
        <Heart
          className={cn(
            "h-5 w-5 transition-all",
            optimistic && "fill-current",
          )}
          style={
            animating === "add"
              ? { animation: "heart-pop 400ms ease-out" }
              : animating === "remove"
                ? { animation: "heart-shrink 400ms ease-out" }
                : undefined
          }
        />
      )}
    </button>
  );
}
