"use client";

import { trpc } from "@/lib/trpc/client";

export function useProfileStory() {
  const { data: stats, isLoading: sl } = trpc.userMedia.getWatchTimeStats.useQuery();
  const { data: counts, isLoading: cl } = trpc.userMedia.getUserMediaCounts.useQuery();
  const { data: genres, isLoading: gl } = trpc.userMedia.getTopGenres.useQuery();
  const { data: dist, isLoading: dl } = trpc.userMedia.getRatingDistribution.useQuery();
  const { data: insights, isLoading: il } = trpc.userMedia.getProfileInsights.useQuery();

  const isLoading = sl || cl || gl || dl || il;

  return { stats, counts, genres, dist, insights, isLoading };
}

export type ProfileStoryData = ReturnType<typeof useProfileStory>;
