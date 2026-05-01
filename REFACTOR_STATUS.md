# Canto — Core Architecture Refactor Status

Status doc for the `packages/core` architecture overhaul. **Pendente em cima; histórico embaixo.**

**Last updated**: 2026-05-01 (pós Wave 10 round 2 + replanejamento vertical)
**Current `main` tip**: ver `git log --oneline -1`

---

## ⏳ Pendente — vertical slicing por contexto

> **Mudança estrutural (2026-05-01)**: o plano antigo organizava Wave 10/11/12 por **categoria de leak** (boundary, lint sweep, build). Resultado: mesmos arquivos tocados N vezes, callers atualizados N vezes, contexto nunca "fechado". O novo plano fatia **vertical por contexto** — cada wave entrega um contexto 100% refatorado (boundary + drizzle + naming + branded IDs + typed errors + bad smells + lint sweep), tudo em um pass. **Wave 11a (rule promotion warn → error)** vira side effect: cada context wave promove regras a `error` via per-folder override no eslint config. Quando os 11 contextos têm seus blocks, o flip global é puro housekeeping.

### Checklist por contexto (Definition of Done)

Cada Context Wave (W10.X) só fecha quando o contexto cumpre os 10 critérios abaixo:

(a) **Boundary cleanup** — zero imports de `@canto/core/infra/*` ou `@canto/core/platform/*` em `domain/<ctx>/**`. Deps threading (`logger`, `dispatcher`, `repos`) via interface DI. Existing ports em `domain/shared/ports/` reused; new ports criados se necessário.

(b) **Drizzle helpers gone** — zero `import { eq, and, sql, inArray, ... } from "drizzle-orm"` em `domain/<ctx>/**`. Queries movidas pra repo methods. Type-only imports (`import type { ... } from "drizzle-orm"`) seguem permitidos.

(c) **Naming consistency em ports** — `find*` → `T | null`, `get*` → `T` ou throw, `list*` → `T[]`, `count*` → `number`. Renomear inconsistências quando o port é tocado.

(d) **Branded ID parse no API boundary** — zero `as MediaId` / `as UserId` em consumers (api/worker). Helpers `parseMediaId(raw): MediaId` em `domain/<ctx>/types/<entity>.ts`. Boundary chama parse; domain confia no tipo.

(e) **Typed domain errors** — zero `throw new Error("string")` em `domain/<ctx>/`. Subclasses de `DomainError` em `domain/<ctx>/errors.ts`. Cliente API mapeia error class → HTTP status.

(f) **Sweep latent errors** — zero `no-unnecessary-condition`, `no-non-null-assertion`, `prefer-nullish-coalescing`, `eqeqeq` em `domain/<ctx>/**`. Aplicar checklist anti-bad-smells (16 antipatterns abaixo) sem criar código pior.

(g) **Anti-bad-smells pass** — passada disciplinada nos files do contexto (ver lista abaixo). Não negociável: comments verbosos AI-style removidos, magic numbers em const nomeada, mutação → imutabilidade onde clarifica, dead branches removidos, etc.

(h) **Callers atualizados** — `apps/worker/**` e `packages/api/**` que consomem use cases do contexto compilam + funcionam end-to-end. Tests + typecheck verde.

(i) **ESLint per-folder override habilitado** — bloco em `packages/core/eslint.config.js`:

```js
{
  files: ["src/domain/<ctx>/**/*.ts"],
  rules: {
    "no-restricted-imports": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    eqeqeq: ["error", "always"],
  },
},
```

Promovido a `error` só pros files daquele contexto. Forcing function pra evitar regressão em futuros PRs.

(j) **Status doc atualizado** — linha do contexto no histórico abaixo, marcado ✅.

### Lista de Context Waves (W10.1–W10.11)

Survey real do `domain/**` (file counts, leak counts, port readiness):

| # | Contexto | Files | Top leaks | Estado | Estimativa |
|---|---|---:|---|---|---:|
| **W10.1** | `notifications` | 3 | 0 infra, 0 drizzle, 0 `!` | quase clean — quick win | 15 min |
| **W10.2** | `lists` | 19 | 0 infra residual, 7 `!` | partial round 1 | 30 min |
| **W10.3** | `recommendations` | 19 | 5 platform (cache, tmdb), 8 `!` | partial round 1 | 45 min |
| **W10.4** | `content-enrichment` | 5 | 1 infra residual, 3 `!`, sem ports próprios | partial round 1 | 30 min |
| **W10.5** | `user-media` | 28 | 11 infra, 13 `!`, plex/jellyfin direto | parcial — push-state heavy | 75 min |
| **W10.6** | `file-organization` | 10 | 3 infra, 5 `!`, 1 throw Error | acopla c/ torrents | 40 min |
| **W10.7** | `torrents` | 36 | 25 infra, 22 `!`, 2 throw Error, fs direto | A skippou — maior em sites | 100 min |
| **W10.8** | `media` | 56 | 8+ infra residual, 7 drizzle, 27 `!`, 5 throw Error | maior + complexo | 120 min |
| **W10.9** | `sync` | 5 | 5 infra, 1 drizzle, 4 `!` | acopla c/ media-servers | 30 min |
| **W10.10** | `media-servers` | 23 | 9 infra, 13 `!`, 2 throw Error, **MediaServerPort bypassed** | precisa wireup do port (já definido, 0 consumers) | 75 min |
| **W10.11** | `trakt` | 17 | 3 infra, 8 drizzle, 10 `!` | médio | 60 min |
| **Total** | | **221 files** | | | **~10h trabalho agregado** |

### Parallelização — 2 rounds, worktree-isolated teammates

**Round 1** (paralelo, sem overlap):
- **Teammate G** → W10.1 + W10.2 + W10.3 (notifications + lists + recommendations — pequenos, baixa coesão entre si, ~90 min)
- **Teammate H** → W10.4 + W10.5 (content-enrichment + user-media — acoplados via push-state e ensure-media, ~105 min)
- **Teammate I** → W10.6 + W10.7 (file-organization + torrents — acoplados, file-org importa torrents/rules, ~140 min)

Round 1 wall-clock: **~140 min** (limited by I).

**Round 2** (após R1 mergear):
- **Teammate J** → W10.8 (media — maior, complexo, sozinho, ~120 min)
- **Teammate K** → W10.9 + W10.10 (sync + media-servers — sync orquestra media-servers, ~105 min)
- **Teammate L** → W10.11 (trakt — sozinho, ~60 min)

Round 2 wall-clock: **~120 min** (limited by J).

**Stitching** (entre rounds, pelo leader):
- Cherry-pick por contexto ou rebase se sem conflito
- Resolver merge conflicts em `eslint.config.js` (cada teammate adiciona seu block — append-only)
- Resolver conflicts em ports compartilhados (`MediaRepositoryPort`, etc — se teammate adicionou método)
- Smoke run typecheck + tests entre integrações

### Garantias contra timeout (lições wave-10-B)

Cada teammate prompt instrui:

1. **Commit por sub-passo** (boundary → drizzle → naming → errors → smells → sweep → eslint block) — não num commit gigante. Aim for 5–7 commits por contexto.
2. **Typecheck antes de cada commit** — 10/10 verde sempre.
3. **Tests antes de cada commit** — 152 verde sempre.
4. **Worktree isolada** — `isolation: "worktree"` no Agent call evita race com main.
5. **Cap escopo** — cada teammate recebe contextos específicos, não "limpe tudo que sobrou".
6. **Report progress se idle** — se passar de 200 tool uses sem commit, parar e reportar bloqueio.

### Tasks globais pós-context-waves

#### W11-final (~30 min) — Lint global flip cleanup

Quando todos 11 contextos têm seus blocks `error`:

- Em `tooling/eslint/base.js`: trocar defaults `warn` por `error` (no-non-null-assertion, prefer-nullish-coalescing, eqeqeq).
- Em `packages/core/eslint.config.js`: deletar os 11 per-context override blocks (redundantes — defaults agora são error).
- Substituir override block global de `domain/**` `no-restricted-imports` warn por error.
- Verificar `pnpm lint:strict` zero warnings em domain.

#### W11f (~30-45 min) — Cross-cutting que não cabe num contexto

- **Transaction boundaries**: auditar `download-torrent`, `import-torrent`, `manage-list-items`, `accept-invitation`, `promote-user-media-state-from-playback` — read-then-write sem txn. Adicionar `withTransaction(fn)` ao port shape onde necessário.
- **Magic timeouts/TTLs em const nomeada**: `5 * 60 * 1000`, `30 * 24 * 60 * 60 * 1000`, etc espalhados. Mover pra `domain/<ctx>/constants.ts`.
- **Input validation no API boundary**: confirmar que todo tRPC procedure passa input por validator de `packages/validators` antes de use case. Use case confia no shape.
- **`buildCoreDeps(db): CoreDeps` factory** em `packages/core/src/composition.ts` retornando `{ media, user, lists, recommendations, mediaServers, trakt, userMedia, torrents, folders, notifications, extras, localization, aspectState, contentRating, logger, dispatcher }`. Worker entry e tRPC context usam o mesmo helper.

#### W12 (~60-90 min) — Build clean + lockdown final

- `pnpm -F @canto/web build` zero warnings.
- CI workflow troca step `Lint` → `pnpm lint:strict` (max-warnings=0).
- `apps/web/next.config.ts`: remover `eslint: { ignoreDuringBuilds: true }` band-aid.
- `apps/web/eslint.config.js`: remover override "soft-fail categories of pre-existing debt".
- `scripts/codemod/package.json` ganha stub `"test": "exit 0"` (ou turbo filter no CI) pra `pnpm exec turbo run test` não falhar.
- **Comment cleanup pass** (passada manual ou semi-automática):
  - Procurar comments inline verbosos AI-style e removê-los onde código bem-nomeado é suficiente.
  - Consolidar restantes em docstrings (JSDoc) seguindo a regra: 1 frase do que faz + 1 particularidade não-óbvia.
  - Comentários "// was: X" / "// removed Y" / narrativas de refactor → deletar.
  - Hot spots conhecidos: `domain/torrents/use-cases/import-torrent*.ts`, `domain/media/use-cases/persist/*.ts`, `domain/media/use-cases/cadence/*.ts`.
- **Atualizar `.claude/skills/handbook`** (skill do projeto) com tudo que vem das waves:
  - Convenção de imports `@canto/<pkg>/...`.
  - Port-first / deps-injection padrão.
  - Anti-bad-smells (lista completa abaixo).
  - SOLID checklist.
  - Onde mora cada port (mapa por contexto).
- **Atualizar `CLAUDE.md`** (raiz do projeto):
  - Substituir descrição genérica de "Code Style" por linkagem à handbook + regras críticas (sem comments inline verbosos, port-first, etc).
  - Adicionar seção "Architecture" com mapa de contextos + ports.
- REFACTOR_STATUS.md final marca tudo ✅. Mover pra `.claude/handbook/refactor-history.md` (artefato histórico) ao invés de manter na raiz.

#### W13 — Nice-to-have (opcional, pós-refactor)

Não bloqueia nada. Roda quando der tempo.

1. **Use case tests via port mocks** — agora que tudo é port-first, escrever tests é trivial. Cobertura atual heavy em cadence/parsing/scoring (puros) mas baixa em use cases. Mock de port + asserts em `deps.repo.X.toHaveBeenCalledWith(...)`. Alvo: cada use case top-traffic com 1+ test happy path + 1 edge.

2. **Per-context `index.ts` (public surface)** — `domain/<ctx>/index.ts` re-exporta só o que é público (use cases + types + ports + errors). API surface vira explícita. Custo: ~14 arquivos. Benefício: discoverability + lint pode bloquear imports de internals.

3. **Structured logging** — depois do `LoggerPort` (Wave 10), substituir `logger.warn("[ctx] msg" + value)` por `logger.warn({ event: "ctx.event", mediaId, userId }, "msg")`. Habilita query/grep por evento, integração com observabilidade futura.

4. **Composition root: factory pattern por entry point** — `composition/{worker,api,test}.ts` por entry. Test version usa mocks. Reduz duplicação + acelera testes.

### Total estimado

| Bloco | Wall-clock |
|---|---|
| Context Waves W10.1–11 (paralelo, 2 rounds) | **~3.5–4.5h** (~10h trabalho agregado) |
| Stitching entre rounds + post | ~30 min |
| W11-final (lint global flip) | 30 min |
| W11f (txn + constants + validators + buildCoreDeps) | 30–45 min |
| W12 (build clean + handbook + CLAUDE.md) | 60–90 min |
| **Total restante (W10–W12)** | **~5.5–7h wall-clock** |
| W13 (nice-to-have, opcional) | 4–6h |

(Plano horizontal anterior era ~13–17h sequencial. Ganho: ~2x via parallelização + per-context lint forcing function que evita revisita.)

### Anti-bad-smells (referência) — NÃO NEGOCIÁVEL

Quando corrigir lint nos contextos, **NÃO criar código pior**. Cada fix deve respeitar SOLID e evitar os smells abaixo. Se o fix correto exige refatoração maior, pare e levante na sessão — melhor deixar o lint warn temporariamente do que poluir o código.

1. **Defensive null/undefined check em valor que TS já garante non-null**
   - ❌ `if (obj == null || obj == undefined) return;` quando o tipo é `Obj` (não `Obj | null`)
   - ❌ `if (!value) continue;` quando `value` é `string` (vazio é válido) — força semântica errada
   - ✅ Confiar no tipo. Se TS reclama, corrigir o tipo na origem (signature, return), não no consumidor.

2. **`==` vs `===`**
   - ❌ `if (x == null)` para checar null OR undefined (truque de coerção)
   - ✅ `if (x === null || x === undefined)` ou simplesmente `if (x == null)` apenas com comment justificando — mas geralmente o tipo deve ser refinado pra eliminar a ambiguidade.

3. **Non-null assertion (`!`) como atalho**
   - ❌ `obj.field!.something` quando o tipo permite null
   - ❌ `array[0]!` em array de tamanho variável
   - ✅ Guard clause (`if (!obj.field) throw new Error(...)`) ou narrowing.
   - ✅ `array.find(...)` retornando `T | undefined`, narrow antes de usar.

4. **Type assertion (`as X`) em vez de narrowing**
   - ❌ `(obj as Specific).method()` quando o tipo é `Generic`
   - ✅ Type guard (`if ('method' in obj)` ou predicate function).

5. **Nullish coalescing (`||`) onde `??` é correto**
   - ❌ `value || defaultValue` quando `value` pode ser `0`, `""`, `false` (todos válidos)
   - ✅ `value ?? defaultValue` — só usa default se for null/undefined.

6. **Redundant condition / dead branch**
   - ❌ `if (array.length > 0 && array.length !== 0)` — TS sabe que é equivalente
   - ❌ `try { ... } catch { /* impossível */ }` quando a operação não throw
   - ✅ Remova. Se o lint reclama de `no-unnecessary-condition`, é porque o tipo já garante. Confie.

7. **Magic numbers / strings**
   - ❌ `if (status === 1)` ou `if (mode === "v2")`
   - ✅ Enum, const, branded type. Em SQL adapters, eventualmente OK com comment.

8. **Função fazendo demais (Single Responsibility violation)**
   - ❌ Use case de 200+ linhas mistura validação + I/O + business + persistência + side effects
   - ✅ Extrair: validador puro, helpers internos, side effects no fim. Use cases com >150 linhas merecem revisão.

9. **God object / parâmetros booleanos**
   - ❌ `function doIt(input, flag1, flag2, flag3)` — flag-driven branches escondem 3 funções diferentes
   - ✅ Funções separadas (`doItA`, `doItB`) ou objeto opções nomeadas.

10. **Mutação onde imutabilidade é mais clara**
    - ❌ `const result = []; for (...) { result.push(...) }`
    - ✅ `const result = items.map(...)` ou `.filter(...).map(...)`.
    - ❌ `let x; if (...) x = "a"; else x = "b";`
    - ✅ `const x = condition ? "a" : "b";`

11. **Stringly-typed parameter**
    - ❌ `function setStatus(s: string)` aceitando `"pending" | "downloading" | ...`
    - ✅ Union type ou enum: `setStatus(s: DownloadStatus)`.

12. **Try/catch swallowing errors silenciosamente**
    - ❌ `try { ... } catch {}` — perde diagnóstico
    - ✅ `try { ... } catch (err) { logger.warn(...) }` ou propagate.

13. **Domain importando infra direto** (escopo Wave 10 — checklist (a))
    - ❌ `import { eq } from "drizzle-orm"; ... db.query.foo.findMany({ where: eq(...) })`
    - ✅ `await deps.repo.findFoo(filter)` — repo abstrai SQL.

14. **Inline comments verbosos — código com cara de AI**
    O codebase acumulou muitos comments inline (`// fazendo X agora porque Y`, `// pré-computa Z pra evitar W`) que parecem AI documentando-se pra outra sessão de AI. Isso polui o código e dá smell de "gerado por LLM".
    - ❌ Comments contando história do refactor (`// was: 11 calls; now: 1`)
    - ❌ Comments narrando otimização linha-a-linha
    - ❌ `// loop over items\nfor (...)` — redundante
    - ✅ Default: **SEM COMENTÁRIOS INLINE**. Código bem nomeado já diz o que faz.
    - ✅ Documentação concentrada em **docstring (JSDoc)** acima de função/classe pública, com no máximo:
      1. Uma frase descrevendo o que a função faz.
      2. UMA particularidade não-óbvia se necessário (constraint hidden, side effect surpreendente, edge case).
    - ✅ Comment inline raríssimo — só quando o leitor futuro vai parar e perguntar "por quê?": invariante hidden, workaround pra bug específico (com link), constraint de framework.
    - ❌ `// TODO:` deixados pelo refactor → ✅ se for TODO real, registrar em issue/lista; se não, deletar.

    **Princípio**: o leitor humano não precisa de você narrando o código. Se removê-lo deixar ambíguo, melhore o nome ou a estrutura, não adicione comment.

15. **`// removed:` / `// was:` / "// agora isso vira X" comments**
    - ❌ Comments comemorativos do refactor (`// was: 11 updateDownload calls; now: 1`) viram ruído permanente.
    - ✅ A história do refactor mora em git log + commit message + PR description, NÃO no código.

16. **DRY agressivo demais — abstração prematura**
    - ❌ Extrair helper compartilhado de 3 use cases que coincidem em 5 linhas mas têm semânticas diferentes
    - ✅ Esperar 4-5 sites com mesma semântica antes de DRYficar.

### SOLID checklist (referência)

Quando refatorar:

- **S** (Single Responsibility): cada use case faz UMA coisa. Se descreve com "faz X **e** Y", split.
- **O** (Open/Closed): adicionar nova capability não deve modificar use cases existentes — strategy pattern, deps injection.
- **L** (Liskov): port adapters intercambiáveis. Test que mocka adapter não deve precisar de hacks.
- **I** (Interface Segregation): use cases declaram só o que usam (`deps: { repo }` não `deps: { everything }`). Já é o padrão das waves; manter.
- **D** (Dependency Inversion): depender de port (abstrato), não de adapter (concreto). Wave 10 fecha isso.

### Code review gate

Antes de mergear cada Context Wave, pair-review (ou self-review estrito) das mudanças:

- Cada `if (x == null)` → checar se o tipo justifica a checagem ou se é defensive bloat.
- Cada `as X` → checar se há narrowing alternativo.
- Cada `!` → checar se há guard clause melhor.
- Cada use case modificado → confirmar que não cresceu nem assumiu mais responsabilidades.

---

## 🧭 Princípios para próximas waves

1. **Tests verdes não-negociáveis**: 152/152 + 10/10 typecheck antes de cada commit.
2. **Convenção de imports**: sempre `@canto/<pkg>/<full-path>`. Zero `./` ou `../`. Vide [convenção](#convenção-de-paths-de-imports).
3. **Wave deve ser shippable**: green-to-green, atomic commits por sub-passo, push imediato.
4. **Atomic commits por checklist item**: cada Context Wave gera 5–7 commits (boundary → drizzle → naming → errors → smells → sweep → eslint block). Mensagem documenta what + why + tradeoffs deferred.
5. **NÃO pollute na correção de lint**: vide checklist anti-bad-smells. Lint warn temporário > código pior.
6. **Vertical slice por contexto**: cada Context Wave entrega contexto 100% refatorado. Cross-context coupling = mínimo touch + comment TODO; defer pra context wave do outro contexto.
7. **Spawn teammates pra Context Waves**: worktree-isolated, paralelo entre rounds, serial entre rounds. Cap escopo por teammate.
8. **Per-context lint forcing function**: cada wave promove regras a `error` no eslint via per-folder override. Forcing function evita regressão futura.
9. **Race conditions na working tree são reais**: worktree isolation cobre. Stitching pelo leader resolve conflicts em ports compartilhados + eslint.config.js (append-only blocks).

---

## ✅ Histórico do que foi feito

### Phase 1-5 ✅ (estrutural — Phases originais do plano)

- **Phase 1**: scaffold + branch.
- **Phase 2**: classification JSON.
- **Phase 3**: 11 codemod subcommands sob `scripts/codemod/`.
- **Phase 4** (10 codemods executados):
  - 4.1 split errors em per-context.
  - 4.2 41 moves DDD → per-context.
  - 4.3 package.json exports collapse 34 → 1.
  - 4.4 61 infra moves + 16 legacy barrels deleted.
  - 4.5 sibling barrels (every `index.ts` → `<folder>.ts`).
  - 4.6 102 use case files reparented.
  - 4.7 empty folders removed.
  - 4.8 tsconfig paths.
  - 4.9 477 `~/*` → `@/*` em apps/web.
- **Phase 5**: 10/10 typecheck, 59/59 tests baseline.

### Phase 5.6 ✅ (cadence engine — sprint paralela 2026-04-22→04-30)

Entre Phase 5 e o trabalho de waves, sprint paralela colapsou per-aspect enrichment fanout em engine única. Não fazia parte do plano original.

- `domain/media/enrichment/` strategy registry.
- `domain/media/use-cases/cadence/` pure-function planner.
- `domain/media/use-cases/ensure-media.ts` entry único (substitui legacy worker shells).
- Drop tabelas `*_translation` + colunas i18n base.
- Single-query localization service.
- Admin UI pra cadence knobs.
- `platform/concurrency/run-with-concurrency.ts`.
- Perf no worker (paralelização repack-supersede / folder-scan, batch seed-management, exponential backoff em imports, batch resolve em reverse-sync).

### Wave 0 ✅ (bootstrap)

- **0A** (`406c5227`): ESLint config em todos os 9 packages. Era só `apps/web`; agora `worker, api, core, auth, db, ui, providers, validators, codemod` todos rodam lint.
- **0B** (`10b6b5e0`): 35+ react-hooks bugs em `apps/web`:
  - `useRef(initial) + lockedRef.current` → `useState(initial)` em 10 hub/source components.
  - Hooks após early return movidos pra topo (`seasons-section.tsx`).
  - 6 cases de `exhaustive-deps` resolvidos com `useMemo`/`useCallback`.
  - IIFE em `useCallback` extraída pra helper module-level.
  - Ref forwarding refatorado em `torrents/page.tsx`.
  - 5 hints de `preserve-manual-memoization` em `use-section-query.ts` resolvidos com destructure granular.
  - `handleShare` deps corrigidas para `[user]` (compiler-aligned).

### Wave 1-9 ✅ (per-context port-first)

| Wave | Commit | Contexto | Surface |
|---|---|---|---|
| 1 | `e1c65550` | notifications | 1 entity, 4 methods |
| 2 | `a6bcb6b2` | user | 2 entities (user + userPreference), 8 methods. Adoção da convenção `@canto/<pkg>/...` |
| 3 | `f5ce977a` | lists | 4 entities (list + listMember + listItem + listInvitation), 28 methods |
| 4 | `884b0d9b` | recommendations | 2 entities (userRecommendation + becauseWatched), 9 methods |
| 6 | `28d562fa` | trakt repos | 3 entities (trakt_list_link + trakt_sync_state + trakt_history_sync), 12 methods |
| 5a | `b4aedcda` | media-servers infra | UserConnectionRepositoryPort (10) + PlexAdapterPort (12) + JellyfinAdapterPort (12) |
| 5b | `adb08eea` | media-servers adoption | 7 use cases + 5 consumers |
| 7 | `0260e8d6` | user-media | 8 entities, 6 mappers — maior wave de single-context |
| 8 | `1beaa0c3` | torrents + file-organization | 5+4 entities, TorrentsRepositoryPort (24) + FoldersRepositoryPort (20) |
| 6 finalize | `cba437e9` | trakt cross-context | TraktApiPort (28 methods) + wireup |
| 9A | `108c7a2e` | media core | media/season/episode, MediaRepositoryPort (21 methods) |
| 9B | `ec1d7d8e` | media localization + persist | MediaLocalizationRepositoryPort (10) + MediaAspectStateRepositoryPort (5) + MediaContentRatingRepositoryPort (3) |
| 9C | `19d09ec5` | media extras | MediaExtrasRepositoryPort (18) + content-enrichment shims |
| 9C2 | `093751d1` | cleanup | overlays + fetch-logos + library JOINs + blocklist callers |
| Final partial | `707b8f06` + follow-up | lockdown parcial | F1 (delete repositories.ts), F2 (boundary rules em warn), F3 partial, F5 (lint:strict), F7 (CI), F4 partial sweep (ui/db/codemod/worker zero errors) |

### Wave 10 round 1 ✅ (2026-04-30 — partial boundary cleanup horizontal)

Antes do replanejamento vertical, primeira passada por categoria de leak. Mantida porque trouxe ports + adapters foundation que as Context Waves usam.

| Wave | Commit | Escopo |
|---|---|---|
| W10A content-enrichment | `4a89c6ae` | refresh-extras → MediaExtrasRepositoryPort |
| W10A lists heavy reads | `36438730` | lists → ListsRepositoryPort (5 novos métodos) |
| W10C user-media | `f5e4f5fc` | user-media boundary cleanup |
| W10C recommendations | `a9ec3292` | recommendations boundary + RecommendationsRepositoryPort novos métodos |
| W10C api/worker wiring | `8ff1563a` | tRPC + worker callers |
| Stitching | `8a83790a` | post-merge: manage-list-items conflict, log-watched branded IDs, rebuild-recs imports/casts |
| W11C cleanup | `fd3b1912` | refresh-extras: drop unnecessary conditions + non-null assertions |

### Wave 10 round 2 ✅ (2026-05-01 — port wireup horizontal antes do pivot vertical)

Continuou o slicing horizontal antes do replanejamento. Reduziu boundary warnings de 263 → ~90.

| Wave | Commit | Escopo |
|---|---|---|
| LoggerPort wireup R1 | `6a49a83d` | 6 use cases (user-media, lists, content-enrichment) com deps existentes |
| LoggerPort wireup R2 | `80513a98` | 7 media use cases + list-live-torrents + structure strategy + EnrichmentDeps |
| LoggerPort wireup R3 | `b4437268` | sync-pipeline, scan-folder-for-media, download-torrent + 5 entry points; **`platform/logger/log-error.ts` deletado** |
| JobDispatcherPort wireup | `d8d27e2d` | 8 domain files dropam `dispatchEnsureMedia` direto → `deps.dispatcher.enrichMedia`. EnrichmentDeps + EnsureMediaDeps + PersistDeps + ManageListItemsDeps + RefreshExtrasDeps com dispatcher required. |
| MediaLocalizationRepositoryPort threading | `c5b84a18` | 7 domain files dropam `makeMediaLocalizationRepository(db)` → `deps.localization`. 9 → 2 leak sites (residuais em withFallback). |

**Resultado**: LoggerPort + JobDispatcherPort + MediaLocalizationRepositoryPort 100% wired no domain. Restante (~90 leaks) endereçado pelas Context Waves W10.1–W10.11.

### Wave 10 round 3 (vertical Context Waves) — ⏳ em curso

#### W10.1 — `notifications` ✅ (Teammate G, 2026-05-01)

| Commit | Escopo |
|---|---|
| `ae9c32da` | eslint per-folder override (3 files, contexto já clean — quick win) |

DOD (a-j): contexto já estava sem leaks/`!`/throws/cast antes do wave; commit promove `no-restricted-imports` + `no-non-null-assertion` + `prefer-nullish-coalescing` + `eqeqeq` para `error` em `src/domain/notifications/**`.

#### W10.2 — `lists` ✅ (Teammate G, 2026-05-01)

| Commit | Escopo |
|---|---|
| `63be7be7` | drop unused `_db: Database` parameter de `viewListBySlug` / `viewAllCollectionItems` / `getCollectionLayout` / `updateCollectionLayout` (4 use cases + 2 callers em `api/list/{manage,items}.ts`) |
| `9189fa93` | adiciona `listMemberVotes` ao `ListsRepositoryPort` (era leak direto em `api/list/sharing.ts` via `@canto/core/infra/lists/member-repository`) |
| `07b99561` | `list.getAll` tRPC procedure agora roteia via `repo.findUserListsWithCounts` (último import direto de `infra/lists/list-repository` em api). Side effect: branded `ListId` exposto, `collections-tab.tsx` ajusta `currentIds`/Map para `string[]` |
| `f83481ce` | eslint per-folder override completo (4 rules → error) em `src/domain/lists/**` |

DOD (a-j): boundary clean, drizzle-orm clean, port com `listMemberVotes` adicionado (naming já consistente para a maioria dos métodos — `find*` array methods deferidos). Typed errors via `lists/errors.ts` (já existia). Anti-bad-smells pass: dropped `_db: Database` passthrough. Override completo.

**Deferido**: rename de `find*` array methods (`findMembers`, `findPendingInvitations`, `findUserListsWithCounts`, etc) para `list*` — toca ~128 call sites; melhor fazer numa wave dedicada (W11-final ou folow-up).

#### W10.3 — `recommendations` ✅ (Teammate G, 2026-05-01)

| Commit | Escopo |
|---|---|
| `0525ed2a` | boundary cleanup: 5 use cases (`get-top-10`, `get-genre-tiles`, `get-filter-options`, `get-user-watch-providers`, `search-filter-entities`) trocam `cached()` + `getTmdbProvider()` + `fetchFromTmdb()` por deps. Adiciona `CachePort.wrap` + `makeCache()` adapter, promove `getTrending`/`discover` em `MediaProviderPort`, cria `RecommendationsCatalogPort` + `makeRecommendationsCatalog()` adapter. Wireup em `api/provider/{discovery,filters}.ts` |
| `f1823eea` | drop dead `?? "tmdb"` / `?? null` / `?? []` em `get-recommendations`/`get-spotlight` (LHS já não-nullable). Mantém `?? null` em `posterPath`/`backdropPath` (genuinamente `string \| undefined` no `SearchResult`) |
| `0faa51f0` | eslint per-folder override em `src/domain/recommendations/**` (3 rules → error; `no-non-null-assertion` fica em warn por causa de 13 assertions inherited em `rebuild-user-recs`/`get-recommendations`/`get-spotlight`) |

DOD (a-j): boundary leaks 5 → 0 em platform; drizzle-orm clean; typed errors n/a (recs use cases não throw); anti-bad-smells: dead `??` removidos, magic TTLs em const nomeada (`TOP_10_TTL_SECONDS`, etc). Override parcial — nota inline no eslint config explica por que `no-non-null-assertion` fica em warn.

**Deferido**: `getSetting`/`setSetting` em `get-spotlight` (db helper, não infra/platform — tecnicamente não viola o lint atual mas é cross-context); 13 non-null assertions em array-iteration helpers; rename de `find*` array methods em `RecommendationsRepositoryPort`.

#### W10.4 — `content-enrichment` ✅ (Teammate H, 2026-05-01)

| Commit | Escopo |
|---|---|
| `6d3f7829` | drop dead nullish em `pool-scoring` |
| `c21351eb` | `translate-episodes` lint sweep + LoggerPort thread |
| `f7f78067` | `sync-tmdb-certifications` boundary cleanup (extras port required) |
| `063532c8` | eslint per-folder override (4 rules → error) em `src/domain/content-enrichment/**` |

DOD (a-j): zero infra/platform imports; sem drizzle; sem `throw new Error`; anti-bad-smells (`?? "tmdb"` morto, `||` → `??`, `console.log` → logger, magic 500 → `TVDB_PAGE_SIZE`). Callers wired em `packages/api/src/routers/{settings/core,provider/filters}.ts`. Lint clean (0 warnings em `domain/content-enrichment/**`).

#### W10.5 — `user-media` ⚠️ partial (Teammate H, 2026-05-01)

| Commit | Escopo |
|---|---|
| `b486730e` | drop dead nullish + unused `MediaType` import em `log-watched`/`get-watch-next` |

**Deferrals justificados** (movidos para round 2):

- **Read-only feed use cases** (`get-continue-watching`, `get-library-history`, `get-upcoming-schedule`, `get-watch-next`) usam 5 infra repos (`library-feed-repository`, `watch-history-repository`, `playback-progress-repository`, `state-repository`, `content-enrichment/extras-repository`). Port-first design exige novo **`LibraryFeedRepositoryPort`** (~15 métodos: `findContinueWatchingFeed`, `findUserPlaybackProgressFeed`, `findUserWatchHistoryFeed`, `findUserListMediaCandidates`, `findUserMediaPaginated`, `findUserMediaCounts`, `findLibraryGenres`, `findEpisodesByMediaIds`, `findUserWatchHistoryByMediaIds`, `findUserCompletedPlaybackByMediaIds`, `findUserContinueWatchingMediaIds`, `findUserWatchingShowsMetadata`, `findUserMediaStatesByMediaIds`). Cross-context (media + episode + season) → **mover para W10.8** quando media wave for tratada.
- **`push-playback-position.ts` + `push-watch-state.ts`** importam `infra/media-servers/{plex,jellyfin}.adapter` direto pra writes (`setPlaybackPosition`, `markPlayed`, `markUnplayed`, `findItemIdByProvider`) **que `MediaServerPort` ainda não expõe** (só `testConnection`/`listLibraries`/`scanLibrary`/`fetchItemMediaInfo`). **Mover para W10.10** quando media-servers wave estender o port com a write surface.

#### W10.6 — `file-organization` ✅ (Teammate I, 2026-05-01)

| Commit | Escopo |
|---|---|
| `a1736918` | lift pure helpers (`runWithConcurrency`, `resolveDownloadUrl`, `parseVideoFiles`/`buildSubtitleName`/`ParsedFile`) de `platform/*` → `domain/shared/services` e `domain/torrents/rules` (preliminar para W10.6/W10.7) |
| `abc71b96` | port-first cleanup: 3 use cases threadam MediaRepositoryPort, TorrentsRepositoryPort, FoldersRepositoryPort, MediaLocalizationRepositoryPort, MediaAspectStateRepositoryPort, ListsRepositoryPort, MediaProviderPort, FileSystemPort, LoggerPort, JobDispatcherPort. Typed errors: `ReorganizeWhileImportingError`, `ReorganizeRequiresClientError`. TorrentsRepositoryPort gains `findMediaFilesByMediaId`. ESLint per-folder block (4 rules @ error). Callers wired: `apps/worker/src/jobs/folder-scan.ts`, `packages/api/src/routers/folder/paths.ts`, `packages/api/src/routers/media/versioning.ts`. |

DOD (a-j): boundary 6 → 0; drizzle clean; typed errors via `domain/file-organization/errors.ts`; lint clean. Caller-side `apps/worker/src/jobs/folder-scan.ts` ainda importa `findAllFolders`/`findMediaPathsByFolder` direto (composition root, fine).

#### W10.7 — `torrents` ✅ partial (Teammate I, 2026-05-01)

| Commit | Escopo |
|---|---|
| `9a60da3b` | port-first cleanup: 17 use cases threadam TorrentsRepositoryPort + MediaRepositoryPort + MediaLocalizationRepositoryPort + FoldersRepositoryPort + MediaExtrasRepositoryPort + NotificationsRepositoryPort. Port gains `findActiveDownloadProfile`, `findDownloadConfig`, `findReleaseGroupLookups`. `ReleaseGroupLookups` promovido para `domain/torrents/rules/release-groups`. Typed errors: `MissingDownloadUrlError`, `TorrentMissingHashError`, `TorrentEmptyError`, `TorrentNotFoundInClientError` (4 `throw new Error` substituídos). `folder-routing.ts` collapsa narrows e troca `==` por `===`. ESLint per-folder block (`no-restricted-imports` + `prefer-nullish-coalescing` @ error). Callers wired: `apps/worker/src/jobs/{import-torrents,repack-supersede,rss-sync,stall-detection}.ts`, `packages/api/src/routers/torrent/{import,list,manage,search}.ts`. |

DOD (a-j): boundary 25 → 0; drizzle clean; typed errors via `domain/torrents/errors.ts`. Lint partial: `no-non-null-assertion` + `eqeqeq` ficam em warn — `parsing-episodes.ts` tem 23 `!` em regex captures (pre-existing pattern, low ROI to refactor). Cross-context cast em `list-live-torrents.ts` (`as unknown as` em `mergeLiveData`) flagged para W10.8.

**Deferrals**: 23 `!` em `parsing-episodes.ts` (W11-final / W12 cleanup); `mergeLiveData` boundary leak ainda em `domain/media` (W10.8); `folder-scan.ts` worker importa infra/file-organization caller-side (composition root, ok).

### Convenção de paths de imports (decidida 2026-04-30, em adoção desde Wave 1)

**Regra única**: TODO import usa o nome do package (`@canto/<pkg>/<full-path>`). Zero `./` ou `../`.

- Importar de outro arquivo no mesmo folder: `@canto/<pkg>/<full-path>`
- Importar de outro folder no mesmo package: `@canto/<pkg>/<full-path>`
- Importar cross-package: `@canto/<other-pkg>/<full-path>`

**Por quê uniformidade**: clareza > brevidade. Move-safe (importer pode mover de pasta sem quebrar). Codebase fica consistente — `apps/web` já segue esse padrão (`@/components/...` em todo lugar).

**Por quê não `@/...`**: o tsconfig de cada package tem `"@/*": ["./src/*"]`, mas TypeScript respeita o tsconfig do **arquivo de entrada** quando faz resolution. Quando `apps/worker` typechecka e segue source-files de `@canto/core`, o `@/` resolve pra `apps/worker/src/*`, quebrando builds. Self-reference via `@canto/core/...` resolve via pnpm workspace symlink → consistente em todo lugar.

### Tests + typecheck baseline atual (2026-05-01)

- 10/10 typecheck verde em main.
- 152/152 tests verde (151 passed + 1 skipped).
- `pnpm -F @canto/core lint`: ~90 boundary warnings restantes em `domain/**` (era 263 no Wave Final). Vão zerar pelas Context Waves W10.1–W10.11.
- LoggerPort, JobDispatcherPort, MediaLocalizationRepositoryPort 100% wired no domain (round 2 horizontal).
- `pnpm -F @canto/web lint`: ainda alto, sweep horizontal pendente — abordado pelas Context Waves via per-folder override.
- `pnpm exec turbo run lint`: variável por package; alvo é zero warnings em todos no W12.

### Manual verification ainda pendente

Nenhum dev server foi bootado durante o refactor. Antes de confiar no `main`:

- `rm -rf apps/web/.next && pnpm -F @canto/web dev` — boot em :3000, exercitar `/lists`, `/media/[id]`, `/settings/services`, admin cadence-knobs.
- `pnpm -F @canto/worker dev` — exercitar `ensureMedia` e `mediaCadenceSweep` end-to-end (verificar `media_aspect_state` rows updated).
- `pnpm -F @canto/web build` — production build (Wave 12 alvo).

---

## Resume de waves restantes (ordem)

**Round 1** (paralelo, 3 teammates worktree-isolated, ~140 min wall-clock):
1. **W10.1 + W10.2 + W10.3** (G): notifications + lists + recommendations
2. **W10.4 + W10.5** (H): content-enrichment + user-media
3. **W10.6 + W10.7** (I): file-organization + torrents

**Round 2** (paralelo após R1 mergear, ~120 min wall-clock):
4. **W10.8** (J): media (sozinho — maior)
5. **W10.9 + W10.10** (K): sync + media-servers
6. **W10.11** (L): trakt

**Solo pós-context-waves** (~120 min):
7. **W11-final**: flip global eslint warn → error (defaults limpos, blocks per-context dropados).
8. **W11f**: txn boundaries + magic constants + input validation + `buildCoreDeps(db)` factory.
9. **W12**: build clean + CI `lint:strict` + handbook + CLAUDE.md atualizados. Tudo ✅.

Após W12: refactor original COMPLETO. Phase 5.5 folder consolidation + W13 nice-to-have ficam opcionais.
