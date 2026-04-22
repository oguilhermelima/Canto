import { MediaDetailHeroSkeleton } from "@/components/media/media-detail-hero";

export default function MediaDetailLoading(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <MediaDetailHeroSkeleton />
    </div>
  );
}
