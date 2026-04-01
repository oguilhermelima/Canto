"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { PageHeader } from "~/components/layout/page-header";
import { SettingsTab } from "~/components/media/manage/settings-tab";

interface ManagePageProps {
  params: Promise<{ id: string }>;
}

export default function ManagePage({
  params,
}: ManagePageProps): React.JSX.Element {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";

  const { data: media, isLoading } = trpc.media.getById.useQuery({ id });

  useEffect(() => {
    if (media?.title) {
      document.title = `Manage: ${media.title} \u2014 Canto`;
    }
  }, [media?.title]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-muted-foreground">
          This page is only available to administrators.
        </p>
      </div>
    );
  }

  if (isLoading || !media) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title={media.title}
        subtitle="Manage library, downloads, and media files"
      />

      <div className="px-4 pb-12 pt-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mx-auto max-w-3xl">
          <SettingsTab
            mediaId={media.id}
            mediaType={media.type as "movie" | "show"}
            mediaTitle={media.title}
            currentLibraryId={media.libraryId}
            continuousDownload={media.continuousDownload}
            drawerOpen={true}
            onCloseDrawer={() => router.push(`/media/${id}`)}
          />
        </div>
      </div>
    </div>
  );
}
