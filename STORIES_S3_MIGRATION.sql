-- Migration: Remove content columns from grammar_notes and story_notes,
-- add s3_key column for S3 object key storage.
-- HTML content is now stored exclusively in S3; the DB holds only metadata.

-- grammar_notes
ALTER TABLE grammar_notes DROP COLUMN IF EXISTS markdown_source;
ALTER TABLE grammar_notes DROP COLUMN IF EXISTS html_content;
ALTER TABLE grammar_notes ADD COLUMN IF NOT EXISTS s3_key VARCHAR(500);

-- story_notes
ALTER TABLE story_notes DROP COLUMN IF EXISTS markdown_source;
ALTER TABLE story_notes DROP COLUMN IF EXISTS html_content;
ALTER TABLE story_notes ADD COLUMN IF NOT EXISTS s3_key VARCHAR(500);
