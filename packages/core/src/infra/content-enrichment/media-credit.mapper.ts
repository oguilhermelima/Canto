import type { MediaId } from "@canto/core/domain/media/types/media";
import type {
  CreditType,
  MediaCredit,
  MediaCreditId,
  NewMediaCredit,
} from "@canto/core/domain/media/types/media-credit";
import type { mediaCredit } from "@canto/db/schema";

type Row = typeof mediaCredit.$inferSelect;
type Insert = typeof mediaCredit.$inferInsert;

function toCreditType(value: string): CreditType {
  return value === "crew" ? "crew" : "cast";
}

export function toDomain(row: Row): MediaCredit {
  return {
    id: row.id as MediaCreditId,
    mediaId: row.mediaId as MediaId,
    personId: row.personId,
    name: row.name,
    character: row.character,
    department: row.department,
    job: row.job,
    profilePath: row.profilePath,
    type: toCreditType(row.type),
    order: row.order,
  };
}

export function toRow(input: NewMediaCredit): Insert {
  return {
    mediaId: input.mediaId,
    personId: input.personId,
    name: input.name,
    character: input.character ?? null,
    department: input.department ?? null,
    job: input.job ?? null,
    profilePath: input.profilePath ?? null,
    type: input.type,
    order: input.order,
  };
}
