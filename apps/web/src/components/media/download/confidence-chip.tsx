"use client";

import { cn } from "@canto/ui/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@canto/ui/tooltip";

export interface ScoreComponent {
  label: string;
  points: number;
  detail?: string;
}

export interface ConfidenceBreakdown {
  score: number;
  raw: number;
  maxRaw: number;
  components: ScoreComponent[];
  rejected: boolean;
  rejectReason?: string;
}

interface ConfidenceChipProps {
  score: number;
  breakdown?: ConfidenceBreakdown;
}

/**
 * Confidence score chip with hover breakdown. The chip is a coloured
 * pill; hovering pops the per-component table the scoring engine
 * returned. Releases scored before the breakdown shipped (or returned
 * by older deployments) gracefully fall back to a non-interactive chip.
 */
export function ConfidenceChip({
  score,
  breakdown,
}: ConfidenceChipProps): React.JSX.Element {
  const colour = cn(
    "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
    score >= 70
      ? "bg-green-500/10 text-green-400"
      : score >= 40
        ? "bg-yellow-500/10 text-yellow-400"
        : "bg-muted text-muted-foreground",
  );

  if (!breakdown) {
    return <div className={colour}>{score}</div>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={cn(colour, "cursor-help")}>
            {score}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" align="start" className="max-w-xs p-0">
          <div className="px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-foreground">
                Confidence breakdown
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                raw {breakdown.raw} / {breakdown.maxRaw}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px]">
              {breakdown.components.map((c, i) => (
                <ScoreRow key={`${c.label}-${i}`} component={c} />
              ))}
              {breakdown.components.length === 0 && (
                <span className="col-span-2 text-muted-foreground">
                  No components scored.
                </span>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ScoreRow({
  component,
}: {
  component: ScoreComponent;
}): React.JSX.Element {
  const tone =
    component.points > 0
      ? "text-green-400"
      : component.points < 0
        ? "text-red-400"
        : "text-muted-foreground";
  return (
    <>
      <span className="truncate text-foreground">
        {component.label}
        {component.detail && (
          <span className="ml-1 text-muted-foreground">
            · {component.detail}
          </span>
        )}
      </span>
      <span className={cn("tabular-nums font-medium", tone)}>
        {component.points > 0 ? "+" : ""}
        {component.points}
      </span>
    </>
  );
}
