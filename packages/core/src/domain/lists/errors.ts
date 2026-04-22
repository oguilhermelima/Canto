import { DomainError } from "../shared/errors";

export class ListNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor(listId?: string) {
    super(listId ? `List ${listId} not found` : "List not found");
  }
}

export class ListPermissionError extends DomainError {
  readonly code = "FORBIDDEN" as const;
}

export class ListNameConflictError extends DomainError {
  readonly code = "CONFLICT" as const;

  constructor() {
    super("A list with this name already exists");
  }
}

export class InvalidListNameError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class ListInvitationNotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;

  constructor() {
    super("Invitation not found");
  }
}

export class ListInvitationInvalidError extends DomainError {
  readonly code = "BAD_REQUEST" as const;
}

export class SystemListModificationError extends DomainError {
  readonly code = "BAD_REQUEST" as const;

  constructor() {
    super("Cannot modify system lists");
  }
}
