# Canto — Core Architecture Refactor Status

Status doc for the `packages/core` architecture overhaul. **Pendente em cima; histórico embaixo.**

**Last updated**: 2026-04-30 (pós Wave Final partial)
**Current `main` tip**: ver `git log --oneline -1`

---

## ⏳ Pendente

### Wave 10 — Eliminar 263 boundary leaks em `domain/` (~6-9h)

A regra ESLint de boundary do Wave Final ficou em modo `warn` por causa de 263 violations descobertas. Cada uma é um vazamento real onde domain importa direto de infra/platform/drizzle-orm em vez de usar port via deps.

**Distribuição por contexto:**

| Contexto | Violations |
|---|---:|
| `domain/media/use-cases` | 18 |
| `domain/torrents/use-cases` | 16 |
| `domain/user-media/use-cases` | 14 |
| `domain/recommendations/use-cases` | 10 |
| `domain/media-servers/use-cases` | 10 |
| `domain/trakt/use-cases` | 8 |
| Restante (file-organization, content-enrichment, lists, sync, services, rules) | ~187 |

**Distribuição por categoria:**

| Categoria | Sites |
|---|---:|
| Helpers `drizzle-orm` runtime (`eq`, `and`, `sql`, `inArray`) inline em domain | 142 |
| Imports diretos `@canto/core/infra/media/media-repository` | 21 |
| `platform/logger/log-error` (precisa **LoggerPort** novo) | 16 |
| `platform/queue/bullmq-dispatcher` (`JobDispatcherPort` existe mas é bypassada) | 11 |
| `media-localization-repository.adapter` direto | 11 |
| `media-localized-repository`, `lists/list-repo`, `file-organization/folder-repo`, `torrents/download-repo` | 8 cada |

**Estratégia**: split em sub-waves por contexto (10a/b/c/...). Cada sub-wave threada deps através das use cases que vazam, full-port-ifica chamadas, deleta queries inline em favor de métodos de port.

**Tarefa nova nesta wave**: criar `LoggerPort` em `domain/shared/ports/logger.port.ts` e adapter em `platform/logger/`. Substituir 16 sites de `logAndSwallow` direto.

**Tarefas adjuntas (mesma wave, contemporâneas ao boundary cleanup):**

1. **Naming consistency em ports** — padronizar verbos:
   - `find*` → retorna `T | null`, não throw.
   - `get*` → retorna `T` ou throw.
   - `list*` → retorna `T[]`.
   - `count*` → retorna `number`.

   Hoje há mistura de `findX` / `getX` / `loadX` / `fetchX` no mesmo port. Renomear seguindo a regra acima quando passar pelo arquivo.

2. **Branded IDs: parse vs cast nas fronteiras** — hoje muito `id as MediaId` em consumers (API/worker). Criar `parseMediaId(raw: string): MediaId` em `domain/media/types/media.ts` (idem por entity branded) com validação de UUID. API boundaries chamam `parseMediaId(input.id)`; dentro do domain confia. Remove o `as` shortcut.

3. **Domain errors tipadas** — vários sites ainda fazem `throw new Error("string")` cru. Migrar pra subclasses de `DomainError` (já existem em `<ctx>/errors.ts`). Cliente API mapeia error class → HTTP status.

4. **Composition root `buildCoreDeps(db)`** — `apps/worker/src/index.ts` constrói ~10 adapters manualmente. Extrair `buildCoreDeps(db): CoreDeps` em `packages/core/src/composition.ts` retornando `{ media, user, lists, recommendations, mediaServers, trakt, userMedia, torrents, folders, notifications, extras, localization, aspectState, contentRating, logger }`. tRPC context usa o mesmo helper.

**Critério de done**:
- `pnpm -F @canto/core lint` zero warnings de `no-restricted-imports` em `domain/**`. Promover regra para `error` final.
- Verbos `find/get/list/count` consistentes em todos os ports.
- Zero `as <Brand>Id` em consumers (todos via `parse*Id`).
- Zero `throw new Error(string)` em domain (tudo via DomainError subclasses).
- Worker entry e tRPC context usam `buildCoreDeps`.

### Wave 11 — Lint hardening + qualidade de código (~3-4h)

Promover regras `warn → error` que sobraram + sweep dos errors latentes + erradicar bad smells. Esta wave é tanto sobre **regras strict** quanto sobre **disciplina de código** — não é OK fazer fix-só-para-passar-lint que produz código pior.

#### 11a — Promover regras restantes a `error`

Em `tooling/eslint/base.js` e `apps/web/eslint.config.js`:

| Regra | Atual | Sites | Alvo |
|---|---|---:|---|
| `@typescript-eslint/no-non-null-assertion` | warn | 224 | error |
| `@typescript-eslint/prefer-nullish-coalescing` | warn | 76 | error |
| `eqeqeq` | warn | 128 | error |
| `no-unused-vars` | warn em web | — | error |
| `no-explicit-any` | warn em web | — | error |
| `import-x/consistent-type-specifier-style` | warn em web | — | error |
| `react-hooks/exhaustive-deps` | warn | — | error |
| `react-hooks/rules-of-hooks` | warn | — | error |
| `react-hooks/refs` | warn | — | error |
| `@next/next/no-img-element` | warn | — | error |

Remover override "soft-fail categories of pre-existing debt" de `apps/web/eslint.config.js`.

#### 11b — Sweep dos 241 errors latentes

| Package | Errors |
|---|---:|
| api | 14 |
| web | 36 |
| core | 92 |
| providers | 99 |

Dominados por `no-unnecessary-condition` (197 sites). Round-by-round, auto-fix primeiro depois manual.

#### 11c — Code quality / anti-bad-smells (NÃO NEGOCIÁVEL)

Quando corrigir lint, **NÃO criar código pior**. Cada fix deve respeitar SOLID e evitar os smells abaixo. Se o fix correto exige refatoração maior, pare e levante na sessão — melhor deixar o lint warn temporariamente do que poluir o código.

**Anti-patterns a evitar:**

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

13. **Wave-de-anti-pattern: domain importando infra direto** (escopo Wave 10)
    - ❌ `import { eq } from "drizzle-orm"; ... db.query.foo.findMany({ where: eq(...) })`
    - ✅ `await deps.repo.findFoo(filter)` — repo abstrai SQL.

14. **Inline comments verbosos — código com cara de AI**
    O codebase acumulou muitos comments inline (`// fazendo X agora porque Y`, `// pré-computa Z pra evitar W`) que parecem AI documentando-se pra outra sessão de AI. Isso polui o código e dá smell de "gerado por LLM".
    - ❌ `// Single deferred update — every early-return / success / partial / catch path mutates this and the finally block writes it once. Was 11 separate updateDownload calls per attempt before this refactor.` (comments contando história do refactor)
    - ❌ `// Pre-compute alt-season directories so multi-season torrents call mkdir once per unique season instead of once per file.` (comment narrando otimização)
    - ❌ `// Match each parsed file against the PRE-MOVE torrent file list...` (comment explicando o algoritmo linha-a-linha)
    - ❌ `// loop over items\nfor (...)` — redundante
    - ✅ Default: **SEM COMENTÁRIOS INLINE**. Código bem nomeado já diz o que faz.
    - ✅ Documentação concentrada em **docstring (JSDoc)** acima de função/classe pública, com no máximo:
      1. Uma frase descrevendo o que a função faz.
      2. UMA particularidade não-óbvia se necessário (constraint hidden, side effect surpreendente, edge case).
    - ✅ Comment inline raríssimo — só quando o leitor futuro vai parar e perguntar "por quê?": invariante hidden, workaround pra bug específico (com link), constraint de framework.
    - ❌ `// TODO:` deixados pelo refactor (que viraram dívida)  →  ✅ se for TODO real, registrar em issue/lista; se não, deletar.

    **Princípio**: o leitor humano não precisa de você narrando o código. Se removê-lo deixar ambíguo, melhore o nome ou a estrutura, não adicione comment.

15. **`// removed:` / `// was:` / "// agora isso vira X" comments**
    - ❌ Comments comemorativos do refactor (`// was: 11 updateDownload calls; now: 1`) viram ruído permanente.
    - ✅ A história do refactor mora em git log + commit message + PR description, NÃO no código.

16. **DRY agressivo demais — abstração prematura**
    - ❌ Extrair helper compartilhado de 3 use cases que coincidem em 5 linhas mas têm semânticas diferentes
    - ✅ Esperar 4-5 sites com mesma semântica antes de DRYficar.

#### 11d — SOLID checklist

Quando refatorar:

- **S** (Single Responsibility): cada use case faz UMA coisa. Se descreve com "faz X **e** Y", split.
- **O** (Open/Closed): adicionar nova capability não deve modificar use cases existentes — strategy pattern, deps injection.
- **L** (Liskov): port adapters intercambiáveis. Test que mocka adapter não deve precisar de hacks.
- **I** (Interface Segregation): use cases declaram só o que usam (`deps: { repo }` não `deps: { everything }`). Já é o padrão das waves; manter.
- **D** (Dependency Inversion): depender de port (abstrato), não de adapter (concreto). Wave 10 fecha isso.

#### 11e — Code review gate

Antes de mergear Wave 11, pair-review (ou self-review estrito) das mudanças:

- Cada `if (x == null)` → checar se o tipo justifica a checagem ou se é defensive bloat.
- Cada `as X` → checar se há narrowing alternativo.
- Cada `!` → checar se há guard clause melhor.
- Cada use case modificado → confirmar que não cresceu nem assumiu mais responsabilidades.

#### 11f — Tarefas adjuntas de qualidade

1. **Transaction boundaries explícitas** — alguns use cases fazem read-then-write sem txn (race-conditioneable). Auditar `download-torrent`, `import-torrent`, `manage-list-items`, `accept-invitation`, `promote-user-media-state-from-playback`. Adicionar `withTransaction(fn)` ao port shape onde necessário; use case envolve operação não-atômica.

2. **Magic timeouts/TTLs em const nomeada** — `5 * 60 * 1000`, `30 * 24 * 60 * 60 * 1000`, `60 * 60 * 1000` espalhados em domain code. Mover pra `domain/<ctx>/constants.ts` com nome documentado (`STALL_THRESHOLD_MS`, `METADATA_TTL_MS` — alguns já existem em `ensure-media.types.ts`, replicar pattern). Em rules pure, `const FOO_MS = ... as const;`.

3. **Input validation no API boundary** — alguns tRPC procedures aceitam input sem Zod (recebe `string` arbitrário e re-valida em domain ou nada). Padronizar: todo input passa por validator de `packages/validators` antes de chegar em use case. Use case confia no shape.

### Wave 12 — Build clean + lockdown final (~60-90 min)

- `pnpm -F @canto/web build` zero warnings (Next/Turbopack residuais — geralmente 5-15 itens).
- CI workflow troca step `Lint` → `pnpm lint:strict` (max-warnings=0).
- `scripts/codemod/package.json` ganha stub `"test": "exit 0"` (ou turbo filter no CI) pra `pnpm exec turbo run test` não falhar.
- **Comment cleanup pass** (passada manual ou semi-automática):
  - Procurar comments inline verbosos e removê-los onde código bem-nomeado é suficiente.
  - Consolidar restantes em docstrings (JSDoc) seguindo a regra: 1 frase do que faz + 1 particularidade não-óbvia.
  - Comentários "// was: X" / "// removed Y" / narrativas de refactor → deletar.
  - Hot spots conhecidos: `domain/torrents/use-cases/import-torrent*.ts`, `domain/media/use-cases/persist/*.ts`, `domain/media/use-cases/cadence/*.ts` (rica em comments do refactor anterior).
- **Atualizar `.claude/skills/handbook`** (skill do projeto) com tudo que vem das waves:
  - Convenção de imports `@canto/<pkg>/...`.
  - Port-first / deps-injection padrão.
  - Anti-bad-smells (lista completa do Wave 11c).
  - SOLID checklist.
  - Onde mora cada port (mapa por contexto).
- **Atualizar `CLAUDE.md`** (raiz do projeto):
  - Substituir descrição genérica de "Code Style" por linkagem à handbook + regras críticas (sem comments inline verbosos, port-first, etc).
  - Adicionar seção "Architecture" com mapa de contextos + ports.
- REFACTOR_STATUS.md final marca tudo ✅. Pode mover este doc pra `.claude/handbook/refactor-history.md` (artefato histórico) ao invés de manter na raiz.
- Verificar Phase 5.5 folder consolidation (codemod move folders pro `user-actions/`, `media-servers/scans/`, etc) — opcional, vertical-slice waves tornaram desnecessário pra funcionalidade. Se for fazer, vira Wave 13.

### Wave 13 — Nice-to-have (opcional, pós-refactor)

Não bloqueia nada. Roda quando der tempo.

1. **Use case tests via port mocks** — agora que tudo é port-first, escrever tests é trivial. Cobertura atual heavy em cadence/parsing/scoring (puros) mas baixa em use cases. Mock de port + asserts em `deps.repo.X.toHaveBeenCalledWith(...)`. Alvo: cada use case top-traffic com 1+ test happy path + 1 edge.

2. **Per-context `index.ts` (public surface)** — `domain/<ctx>/index.ts` re-exporta só o que é público (use cases + types + ports + errors). API surface vira explícita. Custo: ~14 arquivos. Benefício: discoverability + lint pode bloquear imports de internals.

3. **Structured logging** — depois do `LoggerPort` (Wave 10), substituir `logger.warn("[ctx] msg" + value)` por `logger.warn({ event: "ctx.event", mediaId, userId }, "msg")`. Habilita query/grep por evento, integração com observabilidade futura.

4. **Composition root: factory pattern por entry point** — todos os `make<X>Repository(db)` constroem na mesma árvore de deps. `composition/{worker,api,test}.ts` por entry. Test version usa mocks. Reduz duplicação + acelera testes.

### Total restante

| Bloco | Estimativa |
|---|---|
| Wave 10 (boundary leaks + naming + parse + errors + composition) | 8-11h |
| Wave 11 (lint sweep + bad smells + txn + constants + validators) | 4-5h |
| Wave 12 (build + comments cleanup + handbook + CLAUDE.md) | 1-1.5h |
| Wave 13 (nice-to-have, opcional) | 4-6h |
| **Total core (W10-W12)** | **~13-17h** |
| **Total com W13** | **~17-23h** |

Realístico: 7-10 sub-sessões pra W10-W12. W13 é tempo livre.

---

## 🧭 Princípios para próximas waves

1. **Tests verdes não-negociáveis**: 144/144 + 10/10 typecheck antes de cada commit.
2. **Convenção de imports**: sempre `@canto/<pkg>/<full-path>`. Zero `./` ou `../`. Vide [convenção](#convenção-de-paths-de-imports).
3. **Wave deve ser shippable**: green-to-green, atomic commit, push imediato.
4. **Atomic commits**: um commit por wave (ou sub-wave). Mensagem documenta what + why + tradeoffs deferred.
5. **NÃO pollute na correção de lint**: vide Wave 11c. Lint warn temporário > código pior.
6. **Defira cross-context não-trivial**: minimum touch + comment TODO. Não tente refatorar 3 contextos numa wave.
7. **Spawn teammates pra waves >50 tool calls**: paralelize quando possível, serial quando há overlap em arquivos.
8. **Race conditions na working tree são reais**: se 2 teammates editam files diferentes, ok; se overlap, serial obrigatório.

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

### Convenção de paths de imports (decidida 2026-04-30, em adoção desde Wave 1)

**Regra única**: TODO import usa o nome do package (`@canto/<pkg>/<full-path>`). Zero `./` ou `../`.

- Importar de outro arquivo no mesmo folder: `@canto/<pkg>/<full-path>`
- Importar de outro folder no mesmo package: `@canto/<pkg>/<full-path>`
- Importar cross-package: `@canto/<other-pkg>/<full-path>`

**Por quê uniformidade**: clareza > brevidade. Move-safe (importer pode mover de pasta sem quebrar). Codebase fica consistente — `apps/web` já segue esse padrão (`@/components/...` em todo lugar).

**Por quê não `@/...`**: o tsconfig de cada package tem `"@/*": ["./src/*"]`, mas TypeScript respeita o tsconfig do **arquivo de entrada** quando faz resolution. Quando `apps/worker` typechecka e segue source-files de `@canto/core`, o `@/` resolve pra `apps/worker/src/*`, quebrando builds. Self-reference via `@canto/core/...` resolve via pnpm workspace symlink → consistente em todo lugar.

### Tests + typecheck baseline atual

- 10/10 typecheck verde em main.
- 144/144 tests verde (143 passed + 1 skipped).
- `pnpm -F @canto/core lint`: 758 problems (boundary warnings + style). Os 263 boundary warnings vão pra Wave 10; restantes pra Wave 11.
- `pnpm -F @canto/web lint`: 307 problems (1 erro pre-existente parsing + 67 warnings + ~239 com regras strict promovidas).
- `pnpm exec turbo run lint`: 8/10 packages com errors (4 limpos: ui, db, codemod, worker).

### Manual verification ainda pendente

Nenhum dev server foi bootado durante o refactor. Antes de confiar no `main`:

- `rm -rf apps/web/.next && pnpm -F @canto/web dev` — boot em :3000, exercitar `/lists`, `/media/[id]`, `/settings/services`, admin cadence-knobs.
- `pnpm -F @canto/worker dev` — exercitar `ensureMedia` e `mediaCadenceSweep` end-to-end (verificar `media_aspect_state` rows updated).
- `pnpm -F @canto/web build` — production build (Wave 12 alvo).

---

## Resume de waves restantes (ordem)

1. **Wave 10**: zerar 263 boundary leaks. Split por contexto. Promove rule pra `error`.
2. **Wave 11**: lint sweep + bad-smell eradicação. Não criar código pior pra passar lint.
3. **Wave 12**: build clean + CI `lint:strict` + final doc. Tudo ✅.

Após Wave 12: refactor original COMPLETO. Phase 5.5 folder consolidation fica como nice-to-have opcional (Wave 13?).
