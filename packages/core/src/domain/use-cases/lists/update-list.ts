import type { Database } from "@canto/db/client";
import type { UpdateListInput } from "@canto/validators";
import { verifyListOwnership } from "../../rules/list-rules";
import { updateList } from "../../../infrastructure/repositories/lists/list";
import { slugify } from "../../rules/slugify";

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
  return updateList(db, input.id, data);
}
