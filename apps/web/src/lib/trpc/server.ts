import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createCaller } from "@canto/api";
import { auth } from "@canto/auth";
import { db } from "@canto/db/client";

const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: (session.user as { role?: string }).role ?? "user",
    },
  };
});

export const createServerCaller = async () => {
  const session = await getSession();
  return createCaller({
    db,
    session,
  });
};
