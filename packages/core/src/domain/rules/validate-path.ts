import nodePath from "node:path";
import { InvalidPathError } from "@canto/core/domain/file-organization/errors";

/** Validate and normalize a filesystem path (must be absolute, no traversal). */
export function validatePath(p: string): string {
  const normalized = nodePath.normalize(p);
  if (normalized.includes("..")) {
    throw new InvalidPathError(`Path "${p}" contains invalid traversal segments`);
  }
  if (!nodePath.isAbsolute(normalized)) {
    throw new InvalidPathError(`Path "${p}" must be absolute`);
  }
  return normalized;
}
