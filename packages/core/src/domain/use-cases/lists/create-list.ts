import type { Database } from "@canto/db/client";
import type { CreateListInput } from "@canto/validators";
import { InvalidListNameError, ListNameConflictError } from "@canto/core/domain/lists/errors";
import {
  createList,
  findUserDefaultVisibility,
} from "../../../infrastructure/repositories/lists/list";
import { slugify } from "../../shared/rules/slugify";

const RESERVED_SLUGS = new Set(["server-library", "watchlist"]);

export async function createListForUser(
  db: Database,
  userId: string,
  input: CreateListInput,
) {
  const slug = slugify(input.name);
  if (!slug) {
    throw new InvalidListNameError(
      "List name must contain at least one letter or number",
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new InvalidListNameError("This list name is reserved");
  }

  const visibility =
    input.visibility ?? (await findUserDefaultVisibility(db, userId));

  try {
    return await createList(db, {
      userId,
      name: input.name,
      slug,
      description: input.description,
      type: "custom",
      visibility,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      throw new ListNameConflictError();
    }
    throw err;
  }
}
