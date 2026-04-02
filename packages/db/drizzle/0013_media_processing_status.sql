ALTER TABLE media ADD COLUMN IF NOT EXISTS processing_status varchar(20) NOT NULL DEFAULT 'ready';
-- Set existing media without metadataUpdatedAt to 'pending'
UPDATE media SET processing_status = 'pending' WHERE metadata_updated_at IS NULL AND processing_status = 'ready';
