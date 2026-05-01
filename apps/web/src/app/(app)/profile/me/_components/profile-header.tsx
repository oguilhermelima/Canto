"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Pencil, Settings, Share2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc/client";
import { tmdbBackdropLoader } from "@/lib/tmdb-image";
import { AvatarPickerDialog } from "./avatar-picker-dialog";
import { ProfileEditDialog } from "./profile-edit-dialog";

interface ProfileHeaderProps {
  children?: React.ReactNode;
}

function formatWatchDays(mins: number | null | undefined): string | null {
  if (!mins) return null;
  const days = Math.floor(mins / 1440);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} watched`;
  const hours = Math.floor(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} watched`;
}

/** True iff the previous page was on this same origin (and document.referrer is readable). */
function isFromSameOrigin(): boolean {
  try {
    return !!document.referrer && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Mosaic of 4 recent backdrops with horizontal cross-fade masks.
 * Used as atmospheric banner when user hasn't uploaded a custom header image.
 */
function BackdropMosaic(): React.JSX.Element | null {
  const { data } = trpc.userMedia.getUserMedia.useQuery({
    limit: 6,
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  const backdrops = (data?.items ?? [])
    .flatMap((i) => (i.backdropPath ? [{ ...i, backdropPath: i.backdropPath }] : []))
    .slice(0, 4);
  if (backdrops.length === 0) return null;

  return (
    <div className="absolute inset-0">
      {backdrops.map((item, i) => {
        const n = backdrops.length;
        const segStart = Math.max(0, (i / n) * 100 - 12);
        const fadeIn = (i / n) * 100;
        const fadeOut = ((i + 1) / n) * 100;
        const segEnd = Math.min(100, ((i + 1) / n) * 100 + 12);
        const mask = `linear-gradient(to right, transparent ${segStart}%, black ${fadeIn}%, black ${fadeOut}%, transparent ${segEnd}%)`;
        return (
          <div
            key={item.mediaId}
            className="absolute inset-0"
            style={{ WebkitMaskImage: mask, maskImage: mask }}
          >
            <Image
              src={item.backdropPath}
              alt=""
              fill
              className="object-cover"
              loader={tmdbBackdropLoader}
              sizes="100vw"
              priority
            />
          </div>
        );
      })}
    </div>
  );
}

export function ProfileHeader({ children }: ProfileHeaderProps): React.JSX.Element {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { data: profile } = trpc.auth.getProfile.useQuery();
  const { data: stats } = trpc.userMedia.getWatchTimeStats.useQuery();
  const { data: counts } = trpc.userMedia.getUserMediaCounts.useQuery();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const handleShare = useCallback(async () => {
    if (!user?.id) return;
    const url = `${window.location.origin}/profile/${user.id}`;
    const displayName = user.name;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `${displayName} on Canto`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Couldn't share profile link");
    }
  }, [user]);

  const handleBack = useCallback(() => {
    if (isFromSameOrigin()) router.back();
    else router.push("/");
  }, [router]);

  const displayName = user?.name ?? "User";
  const bio = profile?.bio;
  const headerImage = profile?.headerImage;
  const year = new Date().getFullYear();

  const filmCount = (counts?.completed ?? 0) + (counts?.watching ?? 0);
  const watchDays = formatWatchDays(stats?.totalMinutes);
  const ratedCount = counts?.rated ?? 0;

  const statLine = [
    `${year}`,
    filmCount > 0 ? `${filmCount} title${filmCount === 1 ? "" : "s"}` : null,
    watchDays,
    ratedCount > 0 ? `${ratedCount} rated` : null,
  ].filter(Boolean);

  return (
    <>
      {/* Floating back button — mobile only */}
      <button
        type="button"
        onClick={handleBack}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-md md:hidden"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      {/* Atmospheric banner — extends under topbar on desktop */}
      <div className="relative h-64 w-full overflow-hidden md:-mt-16 md:h-[26rem] lg:h-[30rem]">
        {headerImage ? (
          <Image
            src={headerImage}
            alt=""
            fill
            className="object-cover"
            unoptimized
            priority
          />
        ) : (
          <BackdropMosaic />
        )}
        {/* Vignette + bottom fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.35)_100%)]" />
      </div>

      {/* Content lifted up to overlap banner */}
      <div className="relative -mt-36 px-5 md:-mt-52 md:px-8 lg:-mt-56 lg:px-12 xl:px-16 2xl:px-24">
        {statLine.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:text-[11px]">
            {statLine.map((s, i) => (
              <span key={i} className="flex items-center gap-x-2">
                {i > 0 && <span aria-hidden>·</span>}
                {s}
              </span>
            ))}
          </p>
        )}

        <div className="mt-4 flex items-start gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-5xl leading-[0.95] tracking-tight text-foreground drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] md:text-6xl lg:text-7xl">
              {displayName}
            </h1>
            {bio && (
              <p className="mt-4 max-w-xl font-serif text-base italic leading-snug text-muted-foreground md:text-lg">
                &ldquo;{bio}&rdquo;
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <button
              type="button"
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-background/80 md:h-20 md:w-20"
              onClick={() => setPickerOpen(true)}
              aria-label="Change avatar"
            >
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={displayName}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-xl font-semibold text-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4 text-white" />
              </div>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                aria-label="Share profile"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                aria-label="Edit profile"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <Link
                href="/preferences"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {children && <div className="mt-8 border-t border-border/40 pt-4">{children}</div>}
      </div>

      <AvatarPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentImage={user?.image}
      />
      <ProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        currentBio={bio}
        currentHeaderImage={headerImage}
      />
    </>
  );
}
