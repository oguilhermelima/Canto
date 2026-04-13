"use client";

import { useMemo } from "react";
import { Skeleton } from "@canto/ui/skeleton";
import { trpc } from "~/lib/trpc/client";
import { useProfileStory } from "./use-profile-story";
import { ProfileSectionRenderer } from "./profile-section-renderer";

export function OverviewTab(): React.JSX.Element {
  const { data, isLoading: sectionsLoading } = trpc.profileSection.list.useQuery();
  const story = useProfileStory();

  const enabledSections = useMemo(
    () => (data?.sections ?? []).filter((s) => s.enabled),
    [data?.sections],
  );

  const isLoading = sectionsLoading || story.isLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-16 py-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-[480px]" />
          <Skeleton className="h-8 w-[320px]" />
        </div>
        <div className="flex gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-48 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (enabledSections.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No sections enabled. Customize your profile in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 lg:gap-14">
      {enabledSections.map((section) => (
        <ProfileSectionRenderer key={section.id} section={section} story={story} />
      ))}
    </div>
  );
}
