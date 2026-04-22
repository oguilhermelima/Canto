import { z } from "zod";

const reviewFlag = z.string().optional();
const note = z.string().optional();

const domainEntryMove = z.object({
  from: z.string(),
  context: z.string(),
  kind: z.enum(["rules", "services", "ports", "types", "mappers", "constants", "errors"]),
  to: z.string(),
  reviewFlag,
  note,
});

const domainEntryDelete = z.object({
  from: z.string(),
  action: z.literal("delete"),
  reason: z.string(),
});

const domainEntryKeep = z.object({
  from: z.string(),
  action: z.literal("keep"),
  note,
});

const domainEntryRenameSibling = z.object({
  from: z.string(),
  action: z.literal("rename-sibling"),
  to: z.string(),
  reason: z.string(),
});

const domainEntrySplitErrors = z.object({
  from: z.string(),
  action: z.literal("split-errors"),
  reason: z.string(),
});

const domainEntry = z.discriminatedUnion("action", [
  domainEntryDelete,
  domainEntryKeep,
  domainEntryRenameSibling,
  domainEntrySplitErrors,
]).or(domainEntryMove);

const infraMove = z.object({
  from: z.string(),
  to: z.string(),
  reviewFlag,
  note,
});

const useCaseContextMove = z.object({
  from: z.string(),
  to: z.string(),
});

const errorAssignment = z.object({
  className: z.string(),
  context: z.string(),
  kind: z.enum(["class", "type"]).optional(),
  reviewFlag,
});

const portNew = z.object({
  name: z.string(),
  path: z.string(),
  methods: z.array(z.string()).optional(),
  replaces: z.string().optional(),
  note,
});

const portExtend = z.object({
  name: z.string(),
  path: z.string(),
  addMethods: z.array(z.string()),
});

export const planSchema = z.object({
  $schema: z.string().optional(),
  branch: z.string(),
  packageRoot: z.string(),
  srcRoot: z.string(),
  contexts: z.array(z.string()).min(1),
  sharedDomainNamespaces: z.array(z.string()).optional(),
  platformNamespaces: z.array(z.string()).optional(),

  domainClassification: z.array(domainEntry),
  useCaseContextMoves: z.array(useCaseContextMove),
  errorAssignments: z.array(errorAssignment),
  infraMoves: z.array(infraMove),
  infraBarrelsToDelete: z.array(z.string()),

  portPlan: z.object({
    new: z.array(portNew),
    extend: z.array(portExtend),
    compositionRoots: z.array(z.string()),
    refactorTargets: z.array(z.string()),
  }),

  aliases: z.object({
    rule: z.string(),
    "apps/web": z.object({
      from: z.string(),
      to: z.string(),
      expectedRewrites: z.number(),
    }),
  }),

  exports: z.object({
    "packages/core/package.json": z.object({
      target: z.object({
        exports: z.record(z.unknown()),
      }),
    }),
  }),
});

export type CodemodPlan = z.infer<typeof planSchema>;
export type DomainEntry = z.infer<typeof domainEntry>;
export type DomainEntryMove = z.infer<typeof domainEntryMove>;
export type InfraMove = z.infer<typeof infraMove>;
export type UseCaseContextMove = z.infer<typeof useCaseContextMove>;
export type ErrorAssignment = z.infer<typeof errorAssignment>;
export type PortNew = z.infer<typeof portNew>;
export type PortExtend = z.infer<typeof portExtend>;

export function isDomainMove(entry: DomainEntry): entry is DomainEntryMove {
  return !("action" in entry) || typeof (entry as { action?: unknown }).action === "undefined";
}
