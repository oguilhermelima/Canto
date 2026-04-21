# API — `packages/api`

tRPC v11 layer, shared between `apps/web` and future `apps/mobile`. **Thin layer only.** Every procedure is a 3-step passthrough: validate input → auth check → delegate to a core use-case / repository.

## Architectural rules

1. **Thin procedures.** Body ≤ ~15 LOC. Only:
   - Input validation via a shared schema from `@canto/validators`.
   - Auth check via middleware (`protectedProcedure` / `adminProcedure`).
   - One call to a core use-case or repository.
   - Return value.
   - `DomainError` bubbles up; the router middleware maps to `TRPCError`.
2. **All Zod schemas live in `@canto/validators`.** Every tRPC input is a named exported schema + its inferred type.
3. **No direct `ctx.db` access in routers.** Go through a repository (`@canto/core/infrastructure/repositories/*`) or a service (`@canto/core/domain/services/*`).
4. **No helper functions at the top of a router file.** Parsing, normalizing, sorting, computing — all lives in `packages/core/domain/rules` or `services`.
5. **Static imports only.** No `await import(...)`.
6. **No external I/O in routers.** No `fetch`, `fs`, `os`. Lives in `packages/core/infrastructure/adapters`.
7. **Single Media entity at the router level.** Branching on `type === "movie"` belongs inside the use-case.
8. **One pagination shape**: input `{ limit, cursor }`, output `{ items, total, nextCursor }`. `cursor` is an integer offset.
9. **No `any`.**
10. **Fire-and-forget errors use `logAndSwallow`** from `@canto/core/lib/log-error`.

## Size budget

| File | Target |
|---|---:|
| Single router | ≤ 250 LOC |
| Single procedure body | ≤ 15 LOC |

## Canonical router

```ts
// packages/api/src/routers/media.ts
import {
  getByExternalInput,
  resolveMediaInput,
  browseMediaInput,
} from "@canto/validators";
import { getByExternal } from "@canto/core/domain/use-cases/get-by-external";
import { resolveMedia } from "@canto/core/domain/use-cases/resolve-media";
import { browseMedia } from "@canto/core/domain/use-cases/browse-media";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { getTvdbProvider } from "@canto/core/lib/tvdb-client";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const mediaRouter = createTRPCRouter({
  getByExternal: protectedProcedure
    .input(getByExternalInput)
    .query(({ ctx, input }) =>
      getByExternal(ctx.db, input, ctx.session.user.id),
    ),

  resolve: protectedProcedure
    .input(resolveMediaInput)
    .query(async ({ ctx, input }) => {
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      return resolveMedia(ctx.db, input, ctx.session.user.id, { tmdb, tvdb });
    }),

  browse: protectedProcedure
    .input(browseMediaInput)
    .query(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      return browseMedia(ctx.db, input, { tmdb });
    }),
});
```

## tRPC setup

`packages/api/src/trpc.ts` defines procedures + the `DomainError` → `TRPCError` middleware:

```ts
const DOMAIN_TO_TRPC: Record<DomainErrorCode, TRPC_ERROR_CODE_KEY> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

const mapDomainErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof DomainError) {
      throw new TRPCError({ code: DOMAIN_TO_TRPC[err.code], message: err.message, cause: err });
    }
    throw err;
  }
});

export const publicProcedure = t.procedure.use(mapDomainErrors);
export const protectedProcedure = t.procedure.use(mapDomainErrors).use(authed);
export const adminProcedure = t.procedure.use(mapDomainErrors).use(admin);
```

Procedures do not need try/catch — throw a specific `DomainError` subclass in the use-case, the middleware maps it.

## Validators placement

Every Zod schema is defined in `@canto/validators`, imported into the router:

```ts
// packages/validators/src/user-media-tracking.ts
import { z } from "zod";

export const logWatchedInput = z.object({
  mediaId: z.string(),
  scope: z.enum(["movie", "episode", "show"]).optional(),
  watchedAt: z.date().optional(),
  source: z.enum(["manual", "plex", "jellyfin"]).optional(),
  rating: z.number().min(0.5).max(5).optional(),
});
export type LogWatchedInput = z.infer<typeof logWatchedInput>;
```

```ts
// packages/api/src/routers/userMedia.ts
import { logWatchedInput } from "@canto/validators";
import { logWatched } from "@canto/core/domain/use-cases/log-watched";

logWatched: protectedProcedure
  .input(logWatchedInput)
  .mutation(({ ctx, input }) =>
    logWatched(ctx.db, ctx.session.user.id, input, { /* deps */ }),
  ),
```

### Composed filter schemas

Shared filter sets compose via `.extend()`:

```ts
// packages/validators/src/media.ts
export const mediaFilterBase = z.object({
  genreIds: z.array(z.number()).optional(),
  language: z.string().optional(),
  sortBy: z.enum([/* … */]).optional(),
  yearMin: z.number().optional(),
  yearMax: z.number().optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  watchProviders: z.array(z.number()).optional(),
  watchRegion: z.string().optional(),
});

// packages/validators/src/library.ts
import { mediaFilterBase } from "./media";
export const libraryFilterInput = mediaFilterBase.extend({
  includeHidden: z.boolean().optional(),
  includeUnreleased: z.boolean().optional(),
});
```

## Where things live (router → target)

| Concern | Destination |
|---|---|
| Input Zod schema | `packages/validators` |
| DB query | `packages/core/infrastructure/repositories/<aggregate>-repository.ts` |
| External API call | `packages/core/infrastructure/adapters/<service>.ts` |
| Pure helper (parse / normalize / compute) | `packages/core/domain/rules/<domain>.ts` |
| Multi-step workflow | `packages/core/domain/use-cases/<action>.ts` |
| OS probe (`freemem`, `loadavg`, `statfs`) | `packages/core/infrastructure/adapters/system-info.ts` |
| Fire-and-forget error path | `logAndSwallow` from `@canto/core/lib/log-error` |

## Consistency checklist

- **Pagination**: input `{ limit, cursor }`, output `{ items, total, nextCursor }`. Use `paginationInput` from validators.
- **Auth**: `protectedProcedure` for user-scoped, `adminProcedure` for admin-only. No ad-hoc auth inside handlers.
- **Errors**: throw a specific `DomainError` subclass in the use-case. The middleware handles mapping.
- **Logging**: `logAndSwallow("context:operation", err)` for fire-and-forget.
- **Translation overlays**: call the shared `translateMediaItems` helper.

## PR checklist — api

- [ ] No inline `z.object({...})` — lives in `@canto/validators`.
- [ ] No `ctx.db.select/insert/update/delete` inside a handler — uses a repository.
- [ ] No `await import(...)` — all static.
- [ ] No `fetch` / `node:fs` / `os` call in a router.
- [ ] Handler body ≤ 30 LOC.
- [ ] No `if (type === "movie")` branching — the use-case decides.
- [ ] No helper function at the top of the router file.
- [ ] No `as any`.
- [ ] Pagination shape matches `{ items, total, nextCursor }` with `cursor: number`.
- [ ] Thrown errors are specific `DomainError` subclasses from `@canto/core/domain/errors`.
