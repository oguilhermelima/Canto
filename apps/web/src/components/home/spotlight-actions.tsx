"use client";

import { AddToListButton } from "@/components/media/add-to-list-button";

interface SpotlightActionsProps {
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  onOpenChange?: (open: boolean) => void;
}

export function SpotlightActions({
  externalId,
  provider,
  type,
  title,
  onOpenChange,
}: SpotlightActionsProps): React.JSX.Element {
  return (
    <AddToListButton
      externalId={externalId}
      provider={provider}
      type={type}
      title={title}
      size="lg"
      onOpenChange={onOpenChange}
    />
  );
}
