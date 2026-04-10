"use client";

import Image from "next/image";
import Link from "next/link";
import { Settings } from "lucide-react";
import { useIntersectionObserver } from "usehooks-ts";
import { TitleBar } from "~/components/layout/titlebar";
import { authClient } from "~/lib/auth-client";

export function ProfileHeader(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const { ref: titleRef, isIntersecting: isTitleVisible } = useIntersectionObserver({
    initialIsIntersecting: true,
    threshold: 0.1,
    rootMargin: "-60px 0px 0px 0px",
  });

  const displayName = user?.name ?? "User";

  return (
    <>
      <TitleBar
        title={!isTitleVisible ? displayName : ""}
        border={!isTitleVisible}
      />
      <div className="px-4 pt-16 pb-5 md:px-8 md:pt-8 md:pb-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex items-center gap-4" ref={titleRef}>
          {user?.image ? (
            <Image
              src={user.image}
              alt={displayName}
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
            {user?.email && (
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>

          <Link
            href="/account"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </>
  );
}
