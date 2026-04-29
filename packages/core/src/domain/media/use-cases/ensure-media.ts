import type { Database } from "@canto/db/client";
import type { ProviderName, MediaType, TvdbProvider } from "@canto/providers";
import { findMediaById } from "../../../infra/repositories";
import {
  findAspectStates,
  type MediaAspectStateRow,
} from "../../../infra/media/media-aspect-state-repository";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import { getActiveUserLanguages } from "../../shared/services/user-service";
import {
  buildForceAspects,
  buildMediaContext,
  classifyError,
  computePlan,
  effectiveProvider,
  loadCadenceKnobs,
  scopesFor,
  stateKey,
  writeAspectState,
  type CadenceSignal,
  type Outcome,
} from "./cadence";
import type {
  Aspect,
  EnsureMediaResult,
  EnsureMediaSpec,
} from "./ensure-media.types";
import { fetchAndPersistLogos } from "./fetch-and-persist-logos";
import { fetchMediaMetadata } from "./fetch-media-metadata";
import { updateMediaFromNormalized } from "./persist";
import { refreshExtras } from "../../content-enrichment/use-cases/refresh-extras";
import { getTmdbProvider } from "../../../platform/http/tmdb-client";
import { getTvdbProvider } from "../../../platform/http/tvdb-client";
import { getSetting } from "@canto/db/settings";
import { translateEpisodes } from "../../content-enrichment/use-cases/translate-episodes";

/**
 * Unified "make sure this media is complete" engine.
 *
 * Callers specify what they need (languages + aspects) and the cadence
 * planner decides which (aspect, scope) tuples are due. Idempotent and safe
 * to re-run — every executed aspect is recorded in `media_aspect_state` so
 * the next visit picks up where this one left off.
 *
 * Execution order: structure → metadata + translations (shared call) → logos
 * → extras. Each stage's writes become visible to later stages.
 */
export async function ensureMedia(
  db: Database,
  mediaId: string,
  spec: EnsureMediaSpec = {},
  providers?: { tmdb: MediaProviderPort; tvdb: MediaProviderPort },
): Promise<EnsureMediaResult> {
  const start = Date.now();
  const result: EnsureMediaResult = initResult(mediaId);

  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) {
    throw new Error(`ensureMedia: media ${mediaId} not found`);
  }

  const languages = (
    spec.languages ?? [...(await getActiveUserLanguages(db))]
  ).filter((l) => !!l);
  result.languagesProcessed = languages;

  // Cadence inputs — knobs once, state snapshot once. Pure functions consume
  // the snapshot so per-aspect upserts don't trigger fresh reads.
  const knobs = await loadCadenceKnobs(db);
  const aspectStates = await findAspectStates(db, mediaId);
  const stateByKey = new Map<string, MediaAspectStateRow>(
    aspectStates.map((r) => [stateKey(r.aspect as Aspect, r.scope), r]),
  );
  const tvdbDefaultShows = (await getSetting("tvdb.defaultShows")) === true;
  const provider = effectiveProvider(
    {
      type: mediaRow.type,
      provider: mediaRow.provider,
      overrideProviderFor: mediaRow.overrideProviderFor,
    },
    { tvdbDefaultShows },
  );
  const ctx = buildMediaContext(mediaRow);
  const now = new Date();
  const signal: CadenceSignal = spec.force ? "forced" : "visited";

  const plan = computePlan({
    state: aspectStates,
    ctx,
    signal,
    activeLanguages: languages,
    effectiveProvider: provider,
    forceAspects: buildForceAspects(spec, languages),
    knobs,
    now,
  });

  const aspectsToRun = new Set<Aspect>(plan.items.map((i) => i.aspect));
  const planTranslationLangs = scopesFor(plan.items, "translations");
  const planLogoLangs = scopesFor(plan.items, "logos");

  if (aspectsToRun.size === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  const deps = providers ?? {
    tmdb: await getTmdbProvider(),
    tvdb: await getTvdbProvider(),
  };

  // Closure over the cadence inputs so per-aspect call sites stay terse and
  // every write goes through the same pure-helper path.
  const persistOutcome = (
    aspect: Aspect,
    scope: string,
    outcome: Outcome,
  ): Promise<void> =>
    writeAspectState({
      db,
      mediaId,
      aspect,
      scope,
      outcome,
      ctx,
      knobs,
      stateByKey,
      now,
      provider,
    });

  const runMetadata = aspectsToRun.has("metadata");
  const runTranslations = aspectsToRun.has("translations");
  const runStructure = aspectsToRun.has("structure");
  const runLogos = aspectsToRun.has("logos");
  const runExtras = aspectsToRun.has("extras");
  const runContentRatings = aspectsToRun.has("contentRatings");

  // Stage 1 — metadata + translations + structure + contentRatings, served by
  // a single fetchMediaMetadata call. We classify a single outcome and apply
  // it to every aspect in the stage so they share a coherent next-eligible.
  if (runMetadata || runTranslations || runStructure || runContentRatings) {
    const useTVDBSeasons =
      mediaRow.type === "show" &&
      !!mediaRow.tvdbId &&
      provider === "tvdb" &&
      mediaRow.provider !== "tvdb";

    const enLangs = languages.filter((l) => l.startsWith("en"));
    const langsForFetch = runTranslations
      ? Array.from(new Set([...enLangs, ...planTranslationLangs]))
      : enLangs;

    let outcome: Outcome = "data";
    try {
      const fetched = await fetchMediaMetadata(
        mediaRow.externalId,
        mediaRow.provider as ProviderName,
        mediaRow.type as MediaType,
        deps,
        {
          useTVDBSeasons,
          supportedLanguages: langsForFetch,
          reprocess: spec.force,
        },
      );
      result.providerCalls.tmdb += 1;
      if (fetched.tvdbSeasons) result.providerCalls.tvdb += 1;

      await updateMediaFromNormalized(db, mediaId, fetched.media);
      result.writes.media = true;
      if (runStructure) result.aspectsExecuted.push("structure");
      if (runMetadata) result.aspectsExecuted.push("metadata");
      if (runTranslations) result.aspectsExecuted.push("translations");
      if (runContentRatings) {
        result.aspectsExecuted.push("contentRatings");
        result.writes.contentRatings = fetched.media.contentRatings?.length ?? 0;
      }

      // TVDB episode-translation fallback for shows that TMDB didn't cover.
      // Runs sequentially inside this job so the worker doesn't dispatch a
      // second ensure-media run (avoiding cycles through the legacy
      // dispatcher). Skip when fetchMediaMetadata already saw a 4xx on
      // /series/:id/extended — the per-language /episodes/default endpoint
      // will hit the same 404. Drives off plan-translation languages so we
      // only pay for languages the cadence engine actually asked for.
      if (
        runTranslations &&
        mediaRow.type === "show" &&
        mediaRow.tvdbId &&
        !fetched.tvdbFailed
      ) {
        for (const lang of planTranslationLangs.filter(
          (l) => !l.startsWith("en"),
        )) {
          try {
            await translateEpisodes(
              db,
              mediaId,
              mediaRow.tvdbId,
              lang,
              deps.tvdb as unknown as TvdbProvider,
            );
            result.providerCalls.tvdb += 1;
          } catch {
            // TVDB may not have translations for this language — non-fatal.
          }
        }
      }
    } catch (err) {
      outcome = classifyError(err);
    }

    const stageWrites: Promise<void>[] = [];
    if (runMetadata) stageWrites.push(persistOutcome("metadata", "", outcome));
    if (runStructure) stageWrites.push(persistOutcome("structure", "", outcome));
    if (runContentRatings)
      stageWrites.push(persistOutcome("contentRatings", "", outcome));
    if (runTranslations) {
      for (const lang of planTranslationLangs) {
        stageWrites.push(persistOutcome("translations", lang, outcome));
      }
    }
    await Promise.all(stageWrites);
  }

  if (runLogos) {
    let logosOutcome: Outcome = "data";
    try {
      const logosWritten = await fetchAndPersistLogos(
        db,
        mediaId,
        mediaRow.externalId,
        mediaRow.type as MediaType,
        languages,
        deps.tmdb,
      );
      result.providerCalls.tmdb += logosWritten.calls;
      result.writes.logos = logosWritten.writes;
      if (logosWritten.calls > 0) result.aspectsExecuted.push("logos");
      if (logosWritten.writes === 0) logosOutcome = "empty";
    } catch (err) {
      logosOutcome = classifyError(err);
    }
    const scopes = planLogoLangs.length > 0 ? planLogoLangs : [""];
    await Promise.all(
      scopes.map((scope) => persistOutcome("logos", scope, logosOutcome)),
    );
  }

  if (runExtras) {
    let extrasOutcome: Outcome = "data";
    try {
      await refreshExtras(db, mediaId, { tmdb: deps.tmdb });
      result.providerCalls.tmdb += 1;
      result.aspectsExecuted.push("extras");
    } catch (err) {
      extrasOutcome = classifyError(err);
    }
    await persistOutcome("extras", "", extrasOutcome);
  }

  result.durationMs = Date.now() - start;
  return result;
}

function initResult(mediaId: string): EnsureMediaResult {
  return {
    mediaId,
    aspectsExecuted: [],
    languagesProcessed: [],
    providerCalls: { tmdb: 0, tvdb: 0 },
    writes: {
      media: false,
      structureSeasons: 0,
      structureEpisodes: 0,
      translationsMedia: 0,
      translationsSeason: 0,
      translationsEpisode: 0,
      logos: 0,
      extras: 0,
      contentRatings: 0,
    },
    skipped: {},
    durationMs: 0,
  };
}

// Re-export the base media row helper so that callers building bulk flows
// don't need a second import.
export { findMediaById };
