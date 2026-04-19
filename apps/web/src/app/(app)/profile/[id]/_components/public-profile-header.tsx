"use client";

import Image from "next/image";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { tmdbBackdropLoader } from "~/lib/tmdb-image";

interface PublicProfile {
  id: string;
  name: string;
  image: string | null;
  bio: string | null;
  headerImage: string | null;
  isPublic: boolean;
  createdAt: Date;
}

interface PublicProfileHeaderProps {
  profile: PublicProfile;
  children?: React.ReactNode;
}

function BackdropMosaic({ userId }: { userId: string }): React.JSX.Element | null {
  const { data } = trpc.publicProfile.getOverview.useQuery({ id: userId });
  const backdrops = (data?.recentCompleted ?? [])
    .filter((i) => i.backdropPath)
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
              src={item.backdropPath!}
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

export function PublicProfileHeader({
  profile,
  children,
}: PublicProfileHeaderProps): React.JSX.Element {
  const router = useRouter();

  const handleBack = useCallback(() => {
    const fromSameOrigin = (() => {
      try {
        return !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    })();
    if (fromSameOrigin) router.back();
    else router.push("/");
  }, [router]);

  const memberSince = new Date(profile.createdAt).getFullYear();

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-md md:hidden"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="relative h-64 w-full overflow-hidden md:-mt-16 md:h-[26rem] lg:h-[30rem]">
        {profile.headerImage ? (
          <Image
            src={profile.headerImage}
            alt=""
            fill
            className="object-cover"
            unoptimized
            priority
          />
        ) : (
          <BackdropMosaic userId={profile.id} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.35)_100%)]" />
      </div>

      <div className="relative -mt-36 px-5 md:-mt-52 md:px-8 lg:-mt-56 lg:px-12 xl:px-16 2xl:px-24">
        <p className="flex items-center gap-x-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:text-[11px]">
          <span>Member since {memberSince}</span>
          <span aria-hidden>·</span>
          <span>Public profile</span>
        </p>

        <div className="mt-4 flex items-start gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-4xl leading-[0.95] tracking-tight text-foreground drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] md:text-5xl lg:text-6xl">
              {profile.name}
            </h1>
            {profile.bio && (
              <p className="mt-3 max-w-xl font-serif text-base italic leading-snug text-muted-foreground md:text-lg">
                &ldquo;{profile.bio}&rdquo;
              </p>
            )}
          </div>

          <div className="shrink-0">
            <div className="relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-background/80 md:h-20 md:w-20">
              {profile.image ? (
                <Image
                  src={profile.image}
                  alt={profile.name}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-xl font-semibold text-foreground">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>

        {children && <div className="mt-8 border-t border-border/40 pt-4">{children}</div>}
      </div>
    </>
  );
}
