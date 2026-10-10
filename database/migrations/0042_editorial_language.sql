-- Preserve historical Chinese copy; new editorial results use neutral columns.
ALTER TABLE analyses
  ADD COLUMN editorial_language text NOT NULL DEFAULT 'zh' CHECK (editorial_language IN ('en','zh')),
  ADD COLUMN title text,
  ADD COLUMN summary text,
  ADD COLUMN reason text;
ALTER TABLE publications ADD COLUMN editorial_language text NOT NULL DEFAULT 'zh' CHECK (editorial_language IN ('en','zh'));
ALTER TABLE stories ADD COLUMN editorial_language text NOT NULL DEFAULT 'zh' CHECK (editorial_language IN ('en','zh'));
ALTER TABLE facts ADD COLUMN editorial_language text NOT NULL DEFAULT 'zh' CHECK (editorial_language IN ('en','zh'));
ALTER TABLE reports ADD COLUMN editorial_language text NOT NULL DEFAULT 'zh' CHECK (editorial_language IN ('en','zh'));

-- Existing editions were generated from Chinese editorial copy. Keep their hashes valid through
-- the explicit legacy compatibility path; no historical prose or edition is rewritten.
ALTER TABLE content_translations DROP CONSTRAINT content_translations_lang_check;
ALTER TABLE content_translations ADD CONSTRAINT content_translations_lang_check CHECK (lang IN ('en','zh'));
ALTER TABLE content_translations ADD COLUMN source_language text NOT NULL DEFAULT 'zh';
ALTER TABLE content_translations ADD CONSTRAINT content_translations_source_language_check
  CHECK (source_language IN ('en','zh','unknown') OR source_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]+)*$');
