-- Task #297: retain a safe, machine-readable report of social embed handling.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS embed_report jsonb;