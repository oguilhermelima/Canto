"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Film, Tv, Check, X, Clock, User } from "lucide-react";
import { mediaDetailHref } from "~/lib/media-href";
import { STATUS_STYLES, formatDate } from "./constants";

interface RequestCardProps {
  req: {
    id: string;
    status: string;
    note: string | null;
    adminNote: string | null;
    createdAt: Date;
    media: {
      type: string;
      externalId: number;
      title: string;
      posterPath: string | null;
      year: number | null;
    } | null;
    user?: { name: string | null; email: string } | null;
  };
  isAdmin: boolean;
  onApprove: (id: string, title: string, media?: { type: string; externalId: number }) => void;
  onReject: (id: string, title: string, media?: { type: string; externalId: number }) => void;
  onCancel: (id: string) => void;
  cancelPending: boolean;
}

export function RequestCard({
  req,
  isAdmin,
  onApprove,
  onReject,
  onCancel,
  cancelPending,
}: RequestCardProps): React.JSX.Element {
  const media = req.media;
  const isPending = req.status === "pending";
  const statusConfig = STATUS_STYLES[req.status];

  return (
    <div className="overflow-hidden rounded-2xl bg-muted/40">
      <div className="flex items-center gap-5 p-5 sm:p-6">
        {/* Poster */}
        <Link
          href={media ? mediaDetailHref(media) : "#"}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-24 sm:w-24"
        >
          {media?.posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w342${media.posterPath}`}
              alt=""
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {media?.type === "show" ? <Tv size={20} className="text-muted-foreground/30" /> : <Film size={20} className="text-muted-foreground/30" />}
            </div>
          )}
        </Link>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={media ? mediaDetailHref(media) : "#"} className="truncate text-base font-semibold text-foreground hover:underline sm:text-lg">
              {media?.title ?? "Unknown media"}
            </Link>
            {statusConfig && (
              <span className={cn("shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-semibold", statusConfig.className)}>
                {statusConfig.label}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {media?.year && (
              <span>{media.year} · {media.type === "show" ? "TV Show" : "Movie"}</span>
            )}
            {isAdmin && req.user != null && (
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-muted-foreground/50" />
                {req.user.name ?? req.user.email}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-muted-foreground/50" />
              {formatDate(req.createdAt)}
            </span>
          </div>

          {/* Notes */}
          {req.note && (
            <p className="mt-2 text-sm text-muted-foreground">{req.note}</p>
          )}
          {req.adminNote && (
            <p className="mt-1 text-sm italic text-muted-foreground/70">Admin: {req.adminNote}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {isPending && isAdmin && (
            <>
              <button
                onClick={() => onApprove(
                  req.id,
                  media?.title ?? "this request",
                  media ? { type: media.type, externalId: media.externalId } : undefined,
                )}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-500"
                title="Approve"
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => onReject(
                  req.id,
                  media?.title ?? "this request",
                  media ? { type: media.type, externalId: media.externalId } : undefined,
                )}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500"
                title="Reject"
              >
                <X size={18} />
              </button>
            </>
          )}
          {isPending && !isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => onCancel(req.id)}
              disabled={cancelPending}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
