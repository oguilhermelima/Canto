"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@canto/ui/button";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";

export default function InvitePage(): React.JSX.Element {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [_listId, setListId] = useState<string | null>(null);

  useDocumentTitle("Accept Invitation");

  const acceptMutation = trpc.list.acceptInvitation.useMutation({
    onSuccess: (data) => {
      void utils.list.getAll.invalidate();
      setStatus("success");
      setListId(data.listId);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMsg(err.message);
    },
  });

  useEffect(() => {
    if (params.token) {
      acceptMutation.mutate({ token: params.token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
      {status === "loading" && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Accepting invitation...</p>
        </>
      )}

      {status === "success" && (
        <>
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-lg font-semibold text-foreground">Invitation accepted</p>
          <p className="text-sm text-muted-foreground">You've been added to the collection.</p>
          <Button className="mt-2 rounded-xl" onClick={() => router.push("/library/collections")}>
            Go to Collections
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <XCircle className="h-12 w-12 text-red-500" />
          <p className="text-lg font-semibold text-foreground">Could not accept invitation</p>
          <p className="text-sm text-muted-foreground">{errorMsg || "The invitation may have expired or already been used."}</p>
          <Button variant="outline" className="mt-2 rounded-xl" onClick={() => router.push("/library")}>
            Go to Library
          </Button>
        </>
      )}
    </div>
  );
}
