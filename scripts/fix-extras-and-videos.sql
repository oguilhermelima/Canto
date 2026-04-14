-- Fix: reset extras_updated_at so all media re-fetches extras on next visit.
--
-- Why:
--   1. Light media (from recommendations) was promoted to "ready" via
--      enrichMedia(full=false) without ever fetching extras (credits, videos,
--      recommendations, similar). With the code fix removing the `downloaded`
--      guard in getByExternal, these will now trigger refreshExtras on next visit.
--
--   2. Videos were fetched with 2-letter language codes only (e.g. "pt" instead
--      of "pt-BR"), missing region-specific trailers on TMDB. Nullifying
--      extras_updated_at forces a re-fetch with the corrected language params.
--
-- Safe to run multiple times — idempotent.
-- Run AFTER deploying the code fixes.

BEGIN;

-- 1. Reset extras for all media so videos get re-fetched with correct language codes
UPDATE media
SET    extras_updated_at = NULL
WHERE  extras_updated_at IS NOT NULL;

-- 2. Delete existing videos so they're re-inserted with correct language coverage
DELETE FROM media_video;

-- 3. Report affected rows
DO $$
DECLARE
  reset_count  INT;
  pending_count INT;
BEGIN
  SELECT count(*) INTO reset_count
  FROM   media
  WHERE  extras_updated_at IS NULL;

  SELECT count(*) INTO pending_count
  FROM   media
  WHERE  processing_status = 'ready'
    AND  extras_updated_at IS NULL;

  RAISE NOTICE '% media rows had extras_updated_at reset', reset_count;
  RAISE NOTICE '% ready media will re-fetch extras on next visit', pending_count;
END $$;

COMMIT;
