-- 2026-05-08: Introduce project/member allocations as core scheduling entity.
-- Safe to run multiple times (idempotent where practical).

BEGIN;

-- Ensure pgcrypto exists for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) New allocations table: Projects & Team Members -> Allocations (direct)
CREATE TABLE IF NOT EXISTS allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_allocations_dates CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_allocations_project ON allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_allocations_member ON allocations(member_id);
CREATE INDEX IF NOT EXISTS idx_allocations_dates ON allocations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_allocations_member_dates ON allocations(member_id, start_date, end_date);

-- 2) team_members: add projects_involved JSON array
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS projects_involved JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3) tasks: convert into project notes/sub-items (optional JSON field)
-- Keep existing columns for backward compatibility; add a JSONB field for optional metadata/subitems.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS meta JSONB;

-- 4) Trigger: updated_at auto update (extend existing trigger creation list)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_updated_at' AND tgrelid = 'allocations'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON allocations FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    -- update_updated_at() is created by baseline schema.sql; if it's missing, ignore here.
    NULL;
  WHEN undefined_table THEN
    -- If baseline tables not created yet, ignore (fresh init should use updated schema.sql).
    NULL;
END;
$$;

COMMIT;

