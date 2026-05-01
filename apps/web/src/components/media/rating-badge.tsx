import { Star } from "lucide-react";
import { cn } from "@canto/ui/cn";

export type RatingBadgeVariant = "public" | "user" | "members";

interface RatingBadgeProps {
  variant: RatingBadgeVariant;
  value: number;
  /** Optional vote count shown as suffix (e.g., members rating). */
  count?: number;
  className?: string;
}

const VARIANT_CONFIG: Record<
  RatingBadgeVariant,
  { text: string; label: string; title: string }
> = {
  public: {
    text: "text-yellow-400",
    label: "TMDB",
    title: "Public rating (TMDB)",
  },
  user: {
    text: "text-emerald-400",
    label: "You",
    title: "Your rating",
  },
  members: {
    text: "text-cyan-300",
    label: "Members",
    title: "Members rating",
  },
};

function formatRating(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

export function RatingBadge({
  variant,
  value,
  count,
  className,
}: RatingBadgeProps): React.JSX.Element {
  const cfg = VARIANT_CONFIG[variant];
  const titleAttr =
    count !== undefined && count > 0
      ? `${cfg.title} (${count} vote${count === 1 ? "" : "s"})`
      : cfg.title;
  return (
    <div
      title={titleAttr}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-black/85 px-1.5 py-[3px] text-xs font-bold leading-none shadow-md ring-1 ring-white/10 backdrop-blur-md",
        cfg.text,
        className,
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider">
        {cfg.label}
      </span>
      <Star size={11} className="fill-current" />
      <span className="tabular-nums">{formatRating(value)}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-semibold tabular-nums">
          ({count})
        </span>
      )}
    </div>
  );
}

/**
 * Inline version of the rating display — same label + star + number format
 * but without the badge box (no bg, ring, shadow). Use when the rating lives
 * inside a metadata line or text flow.
 */
export function RatingInline({
  variant,
  value,
  count,
  className,
}: RatingBadgeProps): React.JSX.Element {
  const cfg = VARIANT_CONFIG[variant];
  const titleAttr =
    count !== undefined && count > 0
      ? `${cfg.title} (${count} vote${count === 1 ? "" : "s"})`
      : cfg.title;
  return (
    <span
      title={titleAttr}
      className={cn(
        "inline-flex items-center gap-1 font-semibold",
        cfg.text,
        className,
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider">
        {cfg.label}
      </span>
      <Star size={11} className="fill-current" />
      <span className="tabular-nums">{formatRating(value)}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-medium tabular-nums opacity-80">
          ({count})
        </span>
      )}
    </span>
  );
}

export function RatingBadgeStack({
  voteAverage,
  userRating,
  membersAvg,
  membersCount,
  className,
}: {
  voteAverage?: number | null;
  userRating?: number | null;
  membersAvg?: number | null;
  membersCount?: number | null;
  className?: string;
}): React.JSX.Element | null {
  const hasPublic =
    voteAverage !== null && voteAverage !== undefined && voteAverage > 0;
  const hasUser =
    userRating !== null && userRating !== undefined && userRating > 0;
  const hasMembers =
    membersAvg !== null && membersAvg !== undefined && membersAvg > 0;
  if (!hasPublic && !hasUser && !hasMembers) return null;

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      {hasPublic && <RatingBadge variant="public" value={voteAverage} />}
      {hasUser && <RatingBadge variant="user" value={userRating} />}
      {hasMembers && (
        <RatingBadge
          variant="members"
          value={membersAvg}
          count={membersCount ?? undefined}
        />
      )}
    </div>
  );
}
