-- Editions and AV1 stance moved out of per-user preferences and into
-- the server-wide download_config row. Drop the orphaned user_preference
-- entries so a search can't accidentally read them via the legacy code
-- path. Values are intentionally lost — admins re-enter them once via
-- the Server Policy section in /manage.
DELETE FROM "user_preference"
WHERE "key" IN (
  'download.preferredEditions',
  'download.avoidedEditions',
  'download.av1Stance'
);
