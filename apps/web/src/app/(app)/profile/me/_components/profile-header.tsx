"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Pencil, Settings } from "lucide-react";
import { useIntersectionObserver } from "usehooks-ts";
import { TitleBar } from "~/components/layout/titlebar";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { AvatarPickerDialog } from "./avatar-picker-dialog";
import { ProfileEditDialog } from "./profile-edit-dialog";

interface ProfileHeaderProps {
  children?: React.ReactNode;
}

export function ProfileHeader({ children }: ProfileHeaderProps): React.JSX.Element {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { data: profile } = trpc.auth.getProfile.useQuery();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { ref: titleRef, isIntersecting: isTitleVisible } = useIntersectionObserver({
    initialIsIntersecting: true,
    threshold: 0.1,
    rootMargin: "-60px 0px 0px 0px",
  });

  const displayName = user?.name ?? "User";
  const bio = profile?.bio;
  const headerImage = profile?.headerImage;

  return (
    <>
      {/* Desktop: normal TitleBar. Mobile: hidden when header image exists */}
      <div className={headerImage ? "hidden md:block" : ""}>
        <TitleBar
          title={!isTitleVisible ? displayName : ""}
          border={!isTitleVisible}
        />
      </div>

      {/* Mobile: fixed back button bar */}
      {headerImage && (
        <div className="fixed left-0 top-0 z-40 flex h-14 w-full items-center px-4 md:hidden">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      {headerImage ? (
        <>
          {/* Banner */}
          <div className="relative -mt-0 h-56 overflow-hidden md:-mt-16 md:h-64 lg:h-72">
            <Image src={headerImage} alt="" fill className="object-cover" unoptimized />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

            {/* Edit + Settings floating on banner */}
            <div className="absolute right-4 top-12 z-20 flex items-center gap-1.5 md:right-8 md:top-20 lg:right-12 xl:right-16 2xl:right-24">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <Link
                href="/preferences"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Profile info overlapping banner */}
          <div className="relative z-10 px-5 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
            <div className="-mt-12 flex items-end gap-4" ref={titleRef}>
              <button
                type="button"
                className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-4 ring-background"
                onClick={() => setPickerOpen(true)}
              >
                {user?.image ? (
                  <Image src={user.image} alt={displayName} width={96} height={96} className="h-24 w-24 rounded-full object-cover" unoptimized />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </button>

              <div className="min-w-0 flex-1 pb-1">
                <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
                {bio && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{bio}</p>}
              </div>
            </div>

            {children && <div className="mt-5">{children}</div>}
            <div className="mt-6" />
          </div>
        </>
      ) : (
        <>
          {/* No header image */}
          <div className="px-5 pt-20 md:px-8 md:pt-10 lg:px-12 xl:px-16 2xl:px-24">
            <div className="flex items-center gap-4" ref={titleRef}>
              <button
                type="button"
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full"
                onClick={() => setPickerOpen(true)}
              >
                {user?.image ? (
                  <Image src={user.image} alt={displayName} width={80} height={80} className="h-20 w-20 rounded-full object-cover" unoptimized />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
                {bio && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{bio}</p>}
              </div>

              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <Link
                href="/preferences"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>

            {children && <div className="mt-6">{children}</div>}
            <div className="mt-6" />
          </div>
        </>
      )}

      <AvatarPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} currentImage={user?.image} />
      <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} currentBio={bio} currentHeaderImage={headerImage} />
    </>
  );
}
