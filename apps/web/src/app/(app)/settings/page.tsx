"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Redirect /settings to /manage (preserving tab param) */
export default function SettingsRedirect(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const tab = params.get("tab");
    router.replace(tab ? `/manage?tab=${tab}` : "/manage");
  }, [router, params]);

  return <div />;
}
