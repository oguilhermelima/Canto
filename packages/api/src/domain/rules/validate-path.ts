import nodePath from "node:path";
import { TRPCError } from "@trpc/server";

/** Validate and normalize a filesystem path (must be absolute, no traversal). */
export function validatePath(p: string): string {
  const normalized = nodePath.normalize(p);
  if (normalized.includes("..")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Path "${p}" contains invalid traversal segments` });
  }
  if (!nodePath.isAbsolute(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Path "${p}" must be absolute` });
  }
  return normalized;
}
