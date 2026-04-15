-- Fix: reset extras_updated_at so all media re-fetches extras on next visit.
--
-- Why:
--   1. Media rows created from recommendations had metadata but no extras
--      (credits, videos, recommendations, similar). Resetting forces a full
--      re-fetch via persistFullMedia on next visit.
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
  needs_fetch  INT;
BEGIN
  SELECT count(*) INTO reset_count
  FROM   media
  WHERE  extras_updated_at IS NULL;

  SELECT count(*) INTO needs_fetch
  FROM   media
  WHERE  extras_updated_at IS NULL
    AND  metadata_updated_at IS NULL;

  RAISE NOTICE '% media rows had extras_updated_at reset', reset_count;
  RAISE NOTICE '% media will do full TMDB fetch on next visit', needs_fetch;
END $$;

COMMIT;
