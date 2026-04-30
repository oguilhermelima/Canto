import type { CreateListInput } from "@canto/validators";
import {
  InvalidListNameError,
  ListNameConflictError,
} from "@canto/core/domain/lists/errors";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import { slugify } from "@canto/core/domain/shared/rules/slugify";

const RESERVED_SLUGS = new Set(["server-library", "watchlist"]);

export interface CreateListDeps {
  repo: ListsRepositoryPort;
}

export async function createListForUser(
  deps: CreateListDeps,
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
    input.visibility ?? (await deps.repo.findUserDefaultVisibility(userId));

  try {
    return await deps.repo.create({
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
