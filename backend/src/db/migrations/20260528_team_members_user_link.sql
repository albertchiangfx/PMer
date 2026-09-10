-- Link team_members to auth users
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE team_members
  ADD CONSTRAINT IF NOT EXISTS fk_team_members_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE team_members
  ADD CONSTRAINT IF NOT EXISTS uq_team_members_user_id UNIQUE (user_id);

