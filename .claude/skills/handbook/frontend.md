# Frontend — `apps/web`

Next.js 15 (App Router) + React 19 + Tailwind v4 + shadcn/ui primitives from `@canto/ui`. Dark-first, mobile-first.

## Architectural rules

1. **No business logic in components.** Mutations, policy, derivations live in tRPC procedures (`packages/api`) which delegate to `packages/core`. Components call hooks and render.
2. **No `useEffect` for data fetching.** Use tRPC `useQuery` / `useMutation` / `useInfiniteQuery`. Invalidate after mutations with `const utils = api.useUtils(); utils.<router>.<proc>.invalidate()`.
3. **No `any`.** Use `unknown` and narrow. If you need a cast, fix the upstream type.
4. **Single `Media` entity** — movies and shows share one renderer chain. `MediaCard`, `MediaDetailHero`, `BrowseItem` accept `NormalizedMedia`.
5. **Tailwind only** — no CSS modules. Inline `style={{}}` only for truly dynamic positional values.
6. **Function components only.** Explicit return type `React.JSX.Element` on exports.
7. **File naming** — kebab-case files, PascalCase components.
8. **Route-local code** lives in `_components/`, `_hooks/`, `_lib/` next to the route's `page.tsx`.
9. **Use `TabBar`** for every 2+-option horizontal toggle.
10. **Use `StateMessage` + `SPACE_STATES`** for every empty/error/end state.
11. **No opacity modifiers on text colors** (`text-X/N`). Opacity on borders, backgrounds, and button surfaces is fine.

## Page pattern

A page file is a **shell**. It composes hooks, layout components, and subcomponents. Page shell target: ≤ 180 LOC.

### Canonical hub page

`apps/web/src/app/(app)/library/page.tsx`:

```tsx
import { PageHeader } from "@canto/ui/page-header";
import { LazySection } from "~/components/layout/lazy-section";
import { HubWatchNextSection } from "./_components/hub-watch-next-section";
import { HubContinueWatchingSection } from "./_components/hub-continue-watching-section";

export default function LibraryPage(): React.JSX.Element {
  return (
    <>
      <PageHeader title="Library" />
      <LazySection eager minHeight={320}>
        <HubWatchNextSection />
      </LazySection>
      <LazySection minHeight={320}>
        <HubContinueWatchingSection />
      </LazySection>
    </>
  );
}
```

Rules:
- First section `eager`, rest lazy.
- `minHeight` on `LazySection` sized to final layout to prevent CLS.
- No data fetch at page level — each section owns its own query.

### Canonical detail page

```tsx
export default function MediaDetailPage({ params }: Props) {
  const resolved = api.media.resolve.useQuery({ /* … */ });
  useDocumentTitle(resolved.data?.title);
  if (!resolved.data) return <MediaDetailHeroSkeleton />;
  return (
    <>
      <MediaDetailHero media={resolved.data} />
      <OverviewSection media={resolved.data} />
      <CreditsSection mediaId={resolved.data.id} />
      <SimilarCarousel mediaId={resolved.data.id} />
    </>
  );
}
```

### Directory layout for heavy pages

```
<route>/
├─ page.tsx                 # shell
├─ _components/             # route-local components
│  ├─ feature-a.tsx
│  └─ feature-b.tsx
├─ _hooks/                  # route-local hooks
│  └─ use-feature-a.ts
└─ _lib/                    # pure helpers
   └─ parse-thing.ts
```

## Component pattern

### Base structure

```tsx
import { cn } from "@canto/ui/cn";
import { api } from "~/lib/trpc/client";

interface FeatureXProps {
  media: NormalizedMedia;
  onAction?: (id: string) => void;
  className?: string;
}

export function FeatureX({ media, onAction, className }: FeatureXProps): React.JSX.Element {
  const utils = api.useUtils();
  const toggle = api.userMedia.toggleFavorite.useMutation({
    onSuccess: () => {
      void utils.userMedia.getByMediaId.invalidate({ mediaId: media.id });
      toast.success("Saved");
    },
  });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* … */}
    </div>
  );
}
```

Rules:
- Props interface co-located above the component.
- `cn()` for class merging.
- `forwardRef` only when a primitive genuinely needs it.
- Polymorphic cards use strategy pattern: one `MediaCard` receives a `browseStrategy` / `historyStrategy` / `progressStrategy` object.

### Size budget

| Kind | Target |
|---|---:|
| Page shell | ≤180 LOC |
| Feature component | ≤200 LOC |
| UI primitive | ≤150 LOC |

Past budget, decompose into sub-components in a folder with `index.tsx` orchestrating.

## Design system

### Tokens

Defined in `apps/web/src/app/globals.css`.

- Surfaces: `bg-background`, `bg-muted`, `bg-card`, `bg-popover`
- Text: `text-foreground`, `text-muted-foreground`, `text-background` (inverted)
- Semantic: `bg-primary` / `text-primary-foreground`, `bg-destructive` / `text-destructive-foreground`
- Borders: `border-border`, `border-input`, `ring-ring`
- Radius: `--radius: 0.75rem` (lg). Scale: `sm=0.375`, `md=0.5`, `lg=0.75`, `xl=1rem`
- Breakpoints: default Tailwind + `3xl=112rem`, `5xl=137.5rem`, `7xl=175rem`

**Opacity rules:**
- **Text**: always full opacity. Pick a full-opacity token — if you need a softer tone, switch to `text-muted-foreground`, don't reach for `/70`.
- **Borders**: opacity is expected. `border-foreground/20`, `border-emerald-500/40`, `border-amber-500/30` are the right tool for muted button borders on varied backgrounds.
- **Backgrounds**: opacity is fine (`bg-foreground/15`, `bg-muted/60`, `bg-black/30`).

### Primitives

All primitives live in `@canto/ui` and are imported from `@canto/ui/<name>`.

| Kind | Primitives |
|---|---|
| Input | `Button`, `Input`, `PasswordInput`, `Textarea`, `Label`, `FormField`, `Select`, `Switch`, `Slider` |
| Display | `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`), `Badge`, `Avatar`, `Skeleton`, `Separator` |
| Overlay | `Dialog`, `ConfirmationDialog`, `Popover`, `DropdownMenu`, `Sheet`, `Tooltip` |
| Layout | `TabBar`, `PageHeader`, `SectionTitle`, `GridLoading`, `ListLoading`, `StateMessage`, `ScrollArea` |
| Raw | `Tabs` (headless Radix — use for in-dialog form tabs, not app-level navigation) |
| Helpers | `cn` from `@canto/ui/cn` |

Presets:
- `SPACE_STATES` from `@canto/ui/presets/space-states` — canonical empty/error/end copy.

### UX states (mandatory on every data surface)

Every data-driven component handles four states:

| State | Pattern |
|---|---|
| Loading | `<GridLoading count={20} />` or `<Skeleton />` matched to final layout |
| Empty | `<StateMessage preset={SPACE_STATES.emptyWatchlist} />` |
| Error | `<StateMessage preset={SPACE_STATES.transmissionLost} onRetry={q.refetch} />` |
| End of list | `<StateMessage preset={SPACE_STATES.endOfUniverse} />` or a small space-themed line in-list |

Empty/error/end copy is always space-themed ("Charting unexplored systems", "Transmission lost", "End of the observable universe"). Pick from `SPACE_STATES` — don't write ad-hoc empty copy.

### Accessibility

- Focus-visible ring via Tailwind defaults baked into `@canto/ui`.
- Icon-only buttons: `aria-label` required.
- Images: `alt` always (empty `alt=""` if decorative).
- Tab-like UI uses `TabBar` (gets `role="tablist"` / `aria-selected` for free).
- Modals use `Dialog` (focus trap + escape built in).
- Custom interactive components support arrow keys + Enter/Space.

### Responsive & dark mode

- Mobile-first. Breakpoint order: default → `md:` (tablet) → `lg:`/`xl:`/`2xl:` (desktop).
- Authenticated shell has `BottomNavbar` on mobile; `<main>` gets `pb-20 md:pb-0`.
- Edge-padding for full-bleed content: `px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24`.
- Horizontal carousels: `overflow-x-auto scrollbar-none` with fixed-width cards.
- Dark mode is the default. CSS vars auto-swap. Never hard-code `white`/`black` — always tokens.

## Data patterns

### Mutations with invalidation

```tsx
const utils = api.useUtils();
const toggle = api.userMedia.toggleFavorite.useMutation({
  onSuccess: () => {
    void utils.userMedia.getByMediaId.invalidate({ mediaId: media.id });
    toast.success("Saved");
  },
  onError: (err) => toast.error(err.message),
});
```

### Infinite queries

Use `useInfiniteQuery` + `useInfiniteScroll` hook from `~/hooks/use-infinite-scroll`. Do not roll your own IntersectionObserver.

### Shared behavior

- `useLibraryBrowse({ view })` — consolidated hook for library routes (`watched`, `history`, `watch-next`, `continue-watching`).
- `useTabState(tabs, defaultValue)` — tab state with optional URL persistence.

## Canonical files

- **Page shell**: `apps/web/src/app/(app)/library/page.tsx`
- **Hub list**: `apps/web/src/components/home/home-section-list.tsx`
- **TabBar**: `packages/ui/src/components/tab-bar.tsx`
- **StateMessage + presets**: `packages/ui/src/components/state-message.tsx` + `packages/ui/src/presets/space-states.ts`
- **Browse page**: `apps/web/src/app/(app)/browse/page.tsx`
- **Detail hero composition**: compose `MediaDetailHero` + section children.

## PR checklist — frontend

- [ ] No `any` added.
- [ ] No `useEffect` for data fetching. No `setTimeout` around `refetch`.
- [ ] No opacity modifier on a text color.
- [ ] Any 2+-option toggle uses `TabBar`.
- [ ] Empty / error / end states use `StateMessage` + `SPACE_STATES`.
- [ ] No inline `z.object({...})` — schemas live in `@canto/validators`.
- [ ] Page shell ≤180 LOC, feature component ≤200 LOC.
- [ ] Route-local code under `_components/`, `_hooks/`, `_lib/`.
- [ ] Mutations invalidate affected queries via `utils.<router>.<proc>.invalidate()`.
- [ ] `alt` on every image; `aria-label` on every icon-only button.
