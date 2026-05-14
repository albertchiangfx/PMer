-- Optional per-milestone span on project Gantt (NULL = UI splits project range evenly until first edit).
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS timeline_start_date DATE,
  ADD COLUMN IF NOT EXISTS timeline_end_date DATE;
