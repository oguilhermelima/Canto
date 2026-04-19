import { PublicProfileContent } from "./_components/public-profile-content";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return <PublicProfileContent userId={id} />;
}
