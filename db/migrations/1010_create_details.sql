-- Details the Create menu collects beyond a body of text.
--
-- Learning entries and general updates are posts, so their own heading, topic and
-- supporting link live on the post rather than being smuggled into the body. A
-- project update gains a draft state, a progress figure, a milestone and a link;
-- teaching gains the objectives a learner should be able to meet afterwards.
ALTER TABLE posts ADD COLUMN title TEXT;
ALTER TABLE posts ADD COLUMN topic TEXT;
ALTER TABLE posts ADD COLUMN link_url TEXT;

ALTER TABLE project_updates ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE project_updates ADD COLUMN progress_percent INTEGER;
ALTER TABLE project_updates ADD COLUMN milestone TEXT;
ALTER TABLE project_updates ADD COLUMN link_url TEXT;

ALTER TABLE learning_resources ADD COLUMN outcomes TEXT;

CREATE INDEX IF NOT EXISTS project_updates_status_idx ON project_updates (project_id, status);
