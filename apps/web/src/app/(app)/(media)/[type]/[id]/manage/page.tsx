import { notFound } from "next/navigation";
import { ManageContent } from "./_components/manage-content";

const typeMap: Record<string, "movie" | "show"> = {
  movies: "movie",
  shows: "show",
};

export default async function ManagePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { type, id } = await params;
  const mediaType = typeMap[type];
  if (!mediaType) notFound();

  return <ManageContent id={id} mediaType={mediaType} />;
}
