"use client";

import Image from "next/image";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { cn } from "@canto/ui/cn";

export type MagicTaskStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface MagicTask {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: MagicTaskStatus;
  error?: string;
}

export function MagicSetup({
  title,
  subtitle,
  tasks,
  children,
}: {
  title: string;
  subtitle: string;
  tasks?: MagicTask[];
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#05030f]">
      {/* Cosmic gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.25) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(59,130,246,0.2) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(236,72,153,0.15) 0%, transparent 60%)",
        }}
      />

      {/* Stars */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Stars />
      </div>

      {/* Saturn */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[20%] -bottom-[35%] h-[140vmin] w-[140vmin] opacity-80 md:-right-[12%] md:-bottom-[40%]"
      >
        <Image src="/saturn.svg" alt="" fill priority className="object-contain animate-[float_18s_ease-in-out_infinite]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
        <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center animate-[fadeIn_0.6s_ease-out]">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-white drop-shadow-[0_2px_24px_rgba(124,58,237,0.45)] sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-lg text-balance text-base leading-relaxed text-white/70 sm:text-lg">
            {subtitle}
          </p>

          {tasks && tasks.length > 0 && <TaskList tasks={tasks} />}
          {children}
        </div>
      </div>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-1.5vmin) rotate(0.5deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

function TaskList({ tasks }: { tasks: MagicTask[] }): React.JSX.Element {
  return (
    <div className="w-full max-w-sm space-y-3">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            {task.status === "running" ? (
              <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
            ) : task.status === "done" ? (
              <Check className="h-5 w-5 text-emerald-400" />
            ) : task.status === "failed" ? (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            ) : (
              <task.icon className="h-5 w-5 text-white/50" />
            )}
          </div>
          <div className="flex flex-col text-left">
            <p
              className={cn(
                "text-sm",
                task.status === "skipped" ? "text-white/50" : "text-white/90",
              )}
            >
              {task.status === "done"
                ? task.label
                    .replace("Syncing", "Synced")
                    .replace("Building", "Built")
                    .replace("Organizing", "Organized")
                : task.status === "failed"
                  ? task.label
                      .replace("Syncing", "Couldn't sync")
                      .replace("Building", "Couldn't build")
                  : task.label}
            </p>
            {task.status === "failed" && task.error && (
              <p className="text-xs text-amber-300/80">{task.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stars(): React.JSX.Element {
  // Deterministic star field — no randomness so the layout is stable across renders
  // and SSR/CSR. Positions chosen to feel scattered but balanced.
  const stars = [
    { x: 8, y: 12, s: 1.2, d: 0 },
    { x: 18, y: 38, s: 0.8, d: 1.4 },
    { x: 27, y: 18, s: 1.6, d: 2.1 },
    { x: 35, y: 70, s: 0.9, d: 0.6 },
    { x: 44, y: 22, s: 1.1, d: 3.2 },
    { x: 52, y: 50, s: 0.7, d: 2.7 },
    { x: 61, y: 14, s: 1.3, d: 1.1 },
    { x: 68, y: 66, s: 0.9, d: 4.0 },
    { x: 75, y: 30, s: 1.5, d: 0.4 },
    { x: 82, y: 12, s: 1.0, d: 2.4 },
    { x: 90, y: 48, s: 0.8, d: 3.6 },
    { x: 14, y: 82, s: 1.1, d: 1.8 },
    { x: 24, y: 90, s: 0.7, d: 0.9 },
    { x: 40, y: 8, s: 1.4, d: 3.9 },
    { x: 56, y: 84, s: 0.9, d: 1.3 },
    { x: 72, y: 88, s: 1.0, d: 2.6 },
    { x: 88, y: 74, s: 0.8, d: 4.3 },
    { x: 6, y: 56, s: 1.2, d: 0.2 },
  ];
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.s}px`,
            height: `${s.s}px`,
            opacity: 0.2,
            animation: `twinkle ${3 + (i % 3)}s ease-in-out ${s.d}s infinite`,
          }}
        />
      ))}
    </>
  );
}
