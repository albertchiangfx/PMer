-- Backfill: copy legacy task-based time_allocations into project-linked allocations.
-- Safe to run multiple times (skips rows that already exist with same project/member/dates).

BEGIN;

INSERT INTO allocations (project_id, member_id, start_date, end_date, notes)
SELECT
  t.project_id,
  ta.team_member_id,
  ta.start_date,
  ta.end_date,
  NULLIF(BTRIM(COALESCE(ta.notes, '')), '')
FROM time_allocations ta
JOIN tasks t ON t.id = ta.task_id
WHERE ta.start_date IS NOT NULL
  AND ta.end_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM allocations x
    WHERE x.project_id = t.project_id
      AND x.member_id = ta.team_member_id
      AND x.start_date = ta.start_date
      AND x.end_date = ta.end_date
  );

UPDATE team_members tm
SET projects_involved = COALESCE(
  (
    SELECT jsonb_agg(DISTINCT jsonb_build_object('project_id', p.id::text, 'name', p.name))
    FROM allocations a
    JOIN projects p ON p.id = a.project_id
    WHERE a.member_id = tm.id
  ),
  '[]'::jsonb
);

COMMIT;
