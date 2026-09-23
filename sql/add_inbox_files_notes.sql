-- Adds a plain user-written comment field to inbox_files, distinct from
-- the existing ai_description (which is AI-extracted, not user-typed).
-- Used by RedRock Documents' camera review screen, where someone can jot
-- a name/note on a photo before it uploads (e.g. "fuel receipt, June trip").
ALTER TABLE inbox_files ADD COLUMN IF NOT EXISTS notes text;
NOTIFY pgrst, 'reload schema';
