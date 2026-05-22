-- 客戶封存：列表預設隱藏，詳情與歷史資料保留
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_clients_not_archived ON clients (name) WHERE archived_at IS NULL;
