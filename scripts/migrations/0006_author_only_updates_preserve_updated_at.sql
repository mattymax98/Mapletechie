-- A profile rename mirrors its display name into the linked posts' saved
-- fallback byline. That is an attribution correction, not an editorial edit:
-- preserve article chronology when author is the only changed field.
-- Other updates keep the original updated_at = now() behavior.
CREATE OR REPLACE FUNCTION set_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.author IS DISTINCT FROM OLD.author
     AND (to_jsonb(NEW) - 'author' - 'updated_at')
       = (to_jsonb(OLD) - 'author' - 'updated_at') THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;