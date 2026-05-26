-- 報價單系統：服務項目庫 + 報價單 + 報價單品項
-- 動畫工作室常用：勾選預先建好的服務 + 改價 + 加自訂列 → 產出 PDF

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS quotation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_label VARCHAR(100) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  description TEXT,
  default_unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  quote_number VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  currency VARCHAR(3) NOT NULL DEFAULT 'TWD',
  issued_date DATE,
  valid_until DATE,
  subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(6, 4) NOT NULL DEFAULT 0.05,
  tax_due DECIMAL(14, 2) NOT NULL DEFAULT 0,
  total DECIMAL(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  pdf_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  service_id UUID REFERENCES quotation_services(id) ON DELETE SET NULL,
  section_label VARCHAR(100) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  description TEXT,
  qty DECIMAL(8, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotations_project ON quotations(project_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_services_active ON quotation_services(is_active, sort_order);

-- updated_at trigger（依賴 schema.sql 已存在的 update_updated_at()）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_updated_at ON quotation_services';
    EXECUTE 'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON quotation_services FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_updated_at ON quotations';
    EXECUTE 'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
  END IF;
END;
$$;

-- 動畫工作室常見服務（從使用者範例：MULTI INC. 報價）
-- 表格空時才 seed，避免重複執行汙染資料
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM quotation_services LIMIT 1) THEN
    INSERT INTO quotation_services (section_label, name, description, default_unit_price, sort_order) VALUES
      ('創意', '創意/腳本/分鏡',          '腳本、storyboard、概念發想',           60000, 10),
      ('美術', '視覺美術設定',             '畫風、色彩、視覺指南',                  70000, 20),
      ('動畫', '產品模型整理',             '3D 模型修整、最佳化',                       0, 30),
      ('動畫', '3D 建模 (Modeling)',       '主體建模',                              25000, 31),
      ('動畫', '3D 貼圖與材質',            'Texturing & Materials',                25000, 32),
      ('動畫', '燈光與渲染',               'Lighting & Rendering',                 10000, 33),
      ('動畫', '3D 動態製作',              '產品 / 角色動態',                            0, 34),
      ('動畫', '2D 動態製作',              'Motion Graphic',                            0, 35),
      ('動畫', '後期影像合成',             'Compositing、後期效果',                      0, 36),
      ('動畫', '輸出與優化',               'Exporting & Optimization',                   0, 37),
      ('音樂', '音樂編曲/音效/混音',       '原創配樂、音效、混音（全球永久授權）',  60000, 40),
      ('情境圖', '概念設計',               'Concept Design / KV 構圖',                   0, 50),
      ('情境圖', '質地效果模擬',           'Texture & Material Simulation',              0, 51),
      ('衍生', 'Re-layout (16:9 → 1:1)',  '由 16:9 延伸為 1:1 版本',               25000, 60),
      ('衍生', 'Re-layout (16:9 → 9:16)', '由 16:9 延伸為 9:16 版本',              25000, 61);
  END IF;
END;
$$;
