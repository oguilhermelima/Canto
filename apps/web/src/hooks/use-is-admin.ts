import { authClient } from "~/lib/auth-client";

export function useIsAdmin(): boolean {
  const { data: session } = authClient.useSession();
  return (session?.user as { role?: string } | undefined)?.role === "admin";
}
