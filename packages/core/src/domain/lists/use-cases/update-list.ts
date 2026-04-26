import type { Database } from "@canto/db/client";
import type { UpdateListInput } from "@canto/validators";
import { verifyListOwnership } from "../rules/list-rules";
import { updateList } from "../../../infra/lists/list-repository";
import { slugify } from "../../shared/rules/slugify";

export async function updateListForUser(
  db: Database,
  userId: string,
  userRole: string,
  input: UpdateListInput,
) {
  await verifyListOwnership(db, input.id, userId, userRole, {
    requiredPermission: "admin",
  });

  const data: Parameters<typeof updateList>[2] = {};
  if (input.name) {
    data.name = input.name;
    data.slug = slugify(input.name);
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.defaultSortBy !== undefined) data.defaultSortBy = input.defaultSortBy;
  if (input.groupByStatus !== undefined) data.groupByStatus = input.groupByStatus;
  if (input.hideCompleted !== undefined) data.hideCompleted = input.hideCompleted;
  if (input.hideDropped !== undefined) data.hideDropped = input.hideDropped;
  if (input.showHidden !== undefined) data.showHidden = input.showHidden;
  return updateList(db, input.id, data);
}
