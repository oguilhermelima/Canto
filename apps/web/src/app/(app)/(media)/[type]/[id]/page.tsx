import { notFound } from "next/navigation";
import { MediaDetailContent } from "./_components/media-detail-content";

const typeMap: Record<string, "movie" | "show"> = {
  movies: "movie",
  shows: "show",
};

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { type, id } = await params;
  const mediaType = typeMap[type];
  if (!mediaType) notFound();

  return <MediaDetailContent id={id} mediaType={mediaType} />;
}
