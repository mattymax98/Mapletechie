CREATE TABLE topics (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  introduction text NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posts
  ADD COLUMN cluster_id integer REFERENCES topics(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN cluster_role text;

ALTER TABLE posts
  ADD CONSTRAINT posts_cluster_role_pair_check
  CHECK (
    (cluster_id IS NULL AND cluster_role IS NULL)
    OR (cluster_id IS NOT NULL AND cluster_role IN ('pillar', 'supporting'))
  );

CREATE UNIQUE INDEX posts_cluster_one_pillar_uq
  ON posts (cluster_id)
  WHERE cluster_role = 'pillar';