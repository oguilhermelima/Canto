"use client";

import { Button } from "@canto/ui/button";
import { Skeleton } from "@canto/ui/skeleton";
import { Check, Download, Loader2, X } from "lucide-react";

interface RequestSectionProps {
  media: { inLibrary: boolean };
  mediaId: string | undefined;
  isAdmin: boolean;
  existingRequest: {
    isLoading: boolean;
    data:
      | {
          id: string;
          status: string;
          adminNote: string | null;
        }
      | undefined;
  };
  requestDownload: {
    mutate: (input: { mediaId: string }) => void;
    isPending: boolean;
  };
  cancelRequest: {
    mutate: (input: { id: string }) => void;
    isPending: boolean;
  };
}

export function RequestSection({
  media,
  mediaId,
  isAdmin,
  existingRequest,
  requestDownload,
  cancelRequest,
}: RequestSectionProps): React.JSX.Element | null {
  if (isAdmin || !mediaId || media.inLibrary) return null;

  if (existingRequest.isLoading) {
    return (
      <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-[120px] rounded-xl" />
      </section>
    );
  }

  const existing = existingRequest.data;

  if (existing) {
    const isPending = existing.status === "pending";
    const isApproved = existing.status === "approved";
    const isRejected = existing.status === "rejected";
    return (
      <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Want to watch this?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending && "Your request is pending admin approval."}
            {isApproved && "Approved — waiting for admin to download."}
            {isRejected &&
              (existing.adminNote ?? "Your request was rejected.")}
          </p>
        </div>
        {isPending && (
          <div className="group/req relative">
            <button
              type="button"
              onClick={() => cancelRequest.mutate({ id: existing.id })}
              disabled={cancelRequest.isPending}
              className="inline-flex h-10 w-[120px] items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all bg-green-500/20 text-green-500 hover:bg-red-500/20 hover:text-red-500"
            >
              <Check className="h-4 w-4 group-hover/req:hidden" />
              <X className="hidden h-4 w-4 group-hover/req:block" />
              <span className="group-hover/req:hidden">Requested</span>
              <span className="hidden group-hover/req:inline">Cancel</span>
            </button>
          </div>
        )}
        {isApproved && (
          <span className="inline-flex h-10 w-[120px] items-center justify-center gap-2 rounded-xl bg-blue-500/15 text-sm font-medium text-blue-500">
            <Check className="h-4 w-4" />
            Approved
          </span>
        )}
        {isRejected && (
          <span className="inline-flex h-10 w-[120px] items-center justify-center gap-2 rounded-xl bg-red-500/15 text-sm font-medium text-red-500">
            <X className="h-4 w-4" />
            Rejected
          </span>
        )}
      </section>
    );
  }

  return (
    <section className="flex items-center gap-4 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <div className="flex-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Want to watch this?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Request the admin to download this content for you.
        </p>
      </div>
      <Button
        className="w-[120px] rounded-xl"
        onClick={() => requestDownload.mutate({ mediaId: mediaId! })}
        disabled={requestDownload.isPending}
      >
        {requestDownload.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Request
      </Button>
    </section>
  );
}
