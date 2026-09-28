ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_modified_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS update_note text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_once_at timestamptz;

CREATE TABLE IF NOT EXISTS post_revisions (
  id serial PRIMARY KEY,
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  base_hash text NOT NULL,
  changes jsonb NOT NULL,
  update_note text,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  proposed_by integer,
  reviewed_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT post_revisions_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS post_revisions_post_status_idx ON post_revisions(post_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION preserve_published_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' AND OLD.published_once_at IS NULL THEN
    NEW.published_once_at = OLD.published_at;
  END IF;
  IF OLD.published_once_at IS NOT NULL THEN
    NEW.published_once_at = OLD.published_once_at;
  END IF;
  IF NEW.status = 'published' AND NEW.published_once_at IS NULL THEN
    NEW.published_once_at = NEW.published_at;
  END IF;
  IF OLD.published_once_at IS NOT NULL AND
     NEW.published_once_at IS DISTINCT FROM OLD.published_once_at THEN
    RAISE EXCEPTION 'Original publication marker cannot be changed';
  END IF;
  IF (OLD.status = 'published' OR OLD.published_once_at IS NOT NULL) AND
     (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
    RAISE EXCEPTION 'Published post URL and publication date cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS posts_preserve_published_identity ON posts;
CREATE TRIGGER posts_preserve_published_identity BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION preserve_published_identity();