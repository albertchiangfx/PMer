-- 客戶協作一頁式 Hub + 報價公開欄位

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS client_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  public_token VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255),
  welcome_message TEXT,
  studio_display_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_viewed_at TIMESTAMP,
  last_viewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_hubs_token ON client_hubs(public_token);
CREATE INDEX IF NOT EXISTS idx_client_hubs_project ON client_hubs(project_id);

CREATE TABLE IF NOT EXISTS client_hub_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID NOT NULL REFERENCES client_hubs(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL DEFAULT 'other',
  label VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_hub_links_hub ON client_hub_links(hub_id, sort_order);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS public_token VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_quotations_public_token ON quotations(public_token);
CREATE INDEX IF NOT EXISTS idx_quotations_client_visible ON quotations(project_id, client_visible);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_updated_at ON client_hubs';
    EXECUTE 'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON client_hubs FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
  END IF;
END;
$$;
