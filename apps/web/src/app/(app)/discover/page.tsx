"use client";

import { useSearchParams } from "next/navigation";
import { DEFAULT_PRESET } from "./_components/constants";
import { RecommendedSection } from "./_sections/recommended-section";
import { DiscoverPresetSection } from "./_sections/discover-preset-section";

export default function DiscoverBrowsePage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const presetKey = searchParams.get("preset") ?? DEFAULT_PRESET;

  if (presetKey === "recommended") {
    return <RecommendedSection />;
  }

  return <DiscoverPresetSection presetKey={presetKey} />;
}
