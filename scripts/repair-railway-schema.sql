-- Run this after any pg_restore from a Replit/older-schema dump.
-- Every statement is idempotent (DO $$ IF NOT EXISTS ... END $$).

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_pkey' AND conrelid = 'categories'::regclass) THEN ALTER TABLE categories ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_pkey' AND conrelid = 'jobs'::regclass) THEN ALTER TABLE jobs ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_pkey') THEN ALTER TABLE audit_logs ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_pkey') THEN ALTER TABLE contacts ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_pkey') THEN ALTER TABLE media ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_views_pkey') THEN ALTER TABLE page_views ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_categories_pkey') THEN ALTER TABLE post_categories ADD PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_unique') THEN ALTER TABLE categories ADD CONSTRAINT categories_name_unique UNIQUE (name); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_slug_unique') THEN ALTER TABLE categories ADD CONSTRAINT categories_slug_unique UNIQUE (slug); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_url_unique') THEN ALTER TABLE media ADD CONSTRAINT media_url_unique UNIQUE (url); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_slug_unique') THEN ALTER TABLE posts ADD CONSTRAINT posts_slug_unique UNIQUE (slug); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_category_id_categories_id_fk') THEN ALTER TABLE posts ADD CONSTRAINT posts_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_categories_post_id_posts_id_fk') THEN ALTER TABLE post_categories ADD CONSTRAINT post_categories_post_id_posts_id_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_categories_category_id_categories_id_fk') THEN ALTER TABLE post_categories ADD CONSTRAINT post_categories_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_job_id_jobs_id_fk') THEN ALTER TABLE job_applications ADD CONSTRAINT job_applications_job_id_jobs_id_fk FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE; END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS post_categories_post_category_uq ON post_categories (post_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS post_categories_one_primary_uq ON post_categories (post_id) WHERE is_primary;
