-- Migrate collection ordering from userPreference JSON to list.position column
-- and list item ordering to listItem.position column.
--
-- Safe to run multiple times (idempotent).

BEGIN;

-- 1. Assign list positions based on system-first, then creation date
WITH ranked AS (
  SELECT id, user_id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(user_id, '__server__')
      ORDER BY is_system DESC, created_at ASC
    ) - 1 AS new_pos
  FROM list
)
UPDATE list SET position = ranked.new_pos
FROM ranked WHERE list.id = ranked.id;

-- 2. Assign list_item positions based on added_at order
WITH ranked AS (
  SELECT id, list_id,
    ROW_NUMBER() OVER (
      PARTITION BY list_id
      ORDER BY added_at ASC
    ) - 1 AS new_pos
  FROM list_item
)
UPDATE list_item SET position = ranked.new_pos
FROM ranked WHERE list_item.id = ranked.id;

-- 3. Clean up orderedListIds from userPreference (keep hiddenListIds)
UPDATE user_preference
SET value = jsonb_build_object('hiddenListIds', COALESCE(value->'hiddenListIds', '[]'::jsonb))
WHERE key = 'library.collectionLayout.v1'
  AND value ? 'orderedListIds';

DO $$
DECLARE
  list_count INT;
  item_count INT;
BEGIN
  SELECT count(*) INTO list_count FROM list WHERE position > 0;
  SELECT count(*) INTO item_count FROM list_item WHERE position > 0;
  RAISE NOTICE '% lists and % items now have position values', list_count, item_count;
END $$;

COMMIT;
