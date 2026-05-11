-- Studio PM Database Schema

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) DEFAULT 'Team Member',
  hourly_rate DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  -- Employment classification: 'permanent' (固定) or 'freelance'.
  employment_type VARCHAR(20) NOT NULL DEFAULT 'permanent',
  email VARCHAR(255),
  phone VARCHAR(20),
  avatar_color VARCHAR(7) DEFAULT '#6366f1',
  -- New scheduling model: quick denormalized list for UI (optional)
  projects_involved JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  description TEXT,
  budget DECIMAL(15, 2),
  status VARCHAR(50) DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  color VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- New model: optional notes/sub-items/metadata (kept flexible)
  meta JSONB,
  task_type VARCHAR(100) DEFAULT 'general',
  status VARCHAR(50) DEFAULT 'todo',
  priority VARCHAR(50) DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- New scheduling core entity (Projects & Team Members -> Allocations)
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

CREATE TABLE IF NOT EXISTS time_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  allocated_days DECIMAL(5, 2) DEFAULT 1,
  allocated_hours DECIMAL(5, 2) DEFAULT 8,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, team_member_id, start_date)
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_number VARCHAR(100) UNIQUE,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  signed_date DATE,
  effective_date DATE,
  expiry_date DATE,
  status VARCHAR(50) DEFAULT 'draft',
  file_path VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  issued_date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  description VARCHAR(255),
  hours DECIMAL(10, 2),
  rate DECIMAL(10, 2),
  amount DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50),
  entity_id UUID,
  action VARCHAR(50),
  changed_fields JSONB,
  changed_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dashboard: milestones drive project progress % (completed / total)
CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  repeatable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Personal reminders per member per project (do not affect global tasks table)
CREATE TABLE IF NOT EXISTS member_personal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  urgent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_member_personal_tasks_member ON member_personal_tasks(team_member_id);
CREATE INDEX IF NOT EXISTS idx_member_personal_tasks_project ON member_personal_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_new_allocations_project ON allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_new_allocations_member ON allocations(member_id);
CREATE INDEX IF NOT EXISTS idx_new_allocations_dates ON allocations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_new_allocations_member_dates ON allocations(member_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_allocations_member ON time_allocations(team_member_id);
CREATE INDEX IF NOT EXISTS idx_allocations_task ON time_allocations(task_id);
CREATE INDEX IF NOT EXISTS idx_allocations_dates ON time_allocations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['team_members','clients','projects','tasks','allocations','time_allocations','contracts','invoices','project_milestones','member_personal_tasks'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END;
$$;
