"use client";

import { useState, useEffect, useCallback } from "react";
import { Film, Clapperboard, Popcorn, Tv, Play, Sparkles, Heart, Star, type LucideIcon } from "lucide-react";

const ICONS: LucideIcon[] = [Film, Clapperboard, Popcorn, Tv, Play, Sparkles, Heart, Star];
const SLOT_SIZE = 40;
const SPIN_ICONS = 10; // how many icons to scroll through per spin

function SlotReel({ targetIndex, delay }: { targetIndex: number; delay: number }): React.JSX.Element {
  const [animating, setAnimating] = useState(false);
  const [strip, setStrip] = useState<LucideIcon[]>([ICONS[targetIndex]!]);
  const [offset, setOffset] = useState(0);

  const spin = useCallback((newTarget: number) => {
    // Build a strip: current icon at top, then random filler, then target at bottom
    const newStrip: LucideIcon[] = [strip[0]!]; // start with current visible
    for (let i = 0; i < SPIN_ICONS; i++) {
      newStrip.push(ICONS[(newTarget + i + 3) % ICONS.length]!);
    }
    newStrip.push(ICONS[newTarget]!); // land on target

    setStrip(newStrip);
    setOffset(0);
    setAnimating(false);

    // Force reflow then animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOffset((SPIN_ICONS + 1) * SLOT_SIZE);
        setAnimating(true);
      });
    });
  }, [strip]);

  useEffect(() => {
    const timeout = setTimeout(() => spin(targetIndex), delay);
    return () => clearTimeout(timeout);
  }, [targetIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="h-10 w-10 overflow-hidden rounded-xl bg-white/[0.08] border border-white/[0.06]"
    >
      <div
        style={{
          transform: `translateY(-${offset}px)`,
          transition: animating ? `transform 0.8s cubic-bezier(0.15, 0.85, 0.35, 1)` : "none",
        }}
        onTransitionEnd={() => {
          // After landing, collapse strip to just the final icon
          setStrip([ICONS[targetIndex]!]);
          setOffset(0);
          setAnimating(false);
        }}
      >
        {strip.map((Icon, i) => (
          <div key={i} className="flex h-10 w-10 shrink-0 items-center justify-center">
            <Icon className="h-5 w-5 text-white/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotMachine(): React.JSX.Element {
  // Each reel has a different starting offset to avoid showing same icons
  const [indices, setIndices] = useState([0, 3, 6]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndices(([a, b, c]) => [
        (a! + 1) % ICONS.length,
        (b! + 2) % ICONS.length,
        (c! + 3) % ICONS.length,
      ]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      {indices.map((targetIndex, i) => (
        <SlotReel key={i} targetIndex={targetIndex} delay={i * 200} />
      ))}
    </div>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left — decorative panel (desktop only) */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[55%] lg:items-center lg:justify-center bg-zinc-950 border-r border-border/30">
        {/* Lava blobs */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/3 h-80 w-80 rounded-full bg-red-600/30 blur-[100px] animate-[lava-1_12s_ease-in-out_infinite]" />
          <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-600/25 blur-[120px] animate-[lava-2_15s_ease-in-out_infinite]" />
          <div className="absolute top-1/2 right-1/3 h-48 w-48 rounded-full bg-rose-500/20 blur-[80px] animate-[lava-3_10s_ease-in-out_infinite]" />
          <div className="absolute bottom-1/3 left-1/4 h-64 w-64 rounded-full bg-violet-700/20 blur-[100px] animate-[lava-4_18s_ease-in-out_infinite]" />
        </div>

        {/* Center content */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/canto.svg" alt="Canto" className="h-14 w-14 dark:invert" />
            <span className="text-4xl font-bold tracking-tight text-white">Canto</span>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-white/80">
              Where every story finds its place
            </h2>
            <p className="max-w-md text-lg text-white/40 leading-relaxed">
              A cozy home for your movies, shows, and anime — quietly waiting for the next night in.
            </p>
          </div>

          <SlotMachine />
        </div>

        <style>{`
          @keyframes lava-1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -50px) scale(1.1); }
            66% { transform: translate(-20px, 30px) scale(0.9); }
          }
          @keyframes lava-2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(-40px, 30px) scale(1.15); }
            66% { transform: translate(20px, -40px) scale(0.85); }
          }
          @keyframes lava-3 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-30px, -30px) scale(1.2); }
          }
          @keyframes lava-4 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(50px, 20px) scale(1.1); }
            66% { transform: translate(-30px, -20px) scale(0.95); }
          }
        `}</style>
      </div>

      {/* Right — form */}
      <div className="flex w-full items-center justify-center px-4 py-12 lg:w-[45%]">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
