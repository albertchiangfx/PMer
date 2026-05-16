-- Optional per-milestone detail markers on timeline (JSON array of { id, date, label }).
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS timeline_detail_nodes JSONB NOT NULL DEFAULT '[]'::jsonb;
