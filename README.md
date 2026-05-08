# Studio PM — 3D 動畫工作室專案管理系統

專為小型 3D 動畫工作室設計的全棧 PM 系統。支援一鍵 Docker Compose 部署到 TrueNAS。

## 功能特色

- **Dashboard** — 專案、成員、發票總覽
- **專案管理** — 建立/追蹤專案，關聯客戶和合約
- **可拖拉 Gantt 圖** — 垂直：成員 / 水平：日期，拖拉改日期或換人，自動偵測衝突
- **合約管理** — 合約狀態追蹤，附件上傳
- **發票模塊** — 手動建立或自動依工時計費，一鍵匯出 PDF
- **成員管理** — 時薪、角色、分配工時

## 快速部署

### 1. 複製設定檔

```bash
cp .env.example .env
```

編輯 `.env`：
```env
DB_PASSWORD=your_secure_password
PORT=80
NEXT_PUBLIC_API_URL=http://your-truenas-ip/api
```

### 2. 啟動服務

```bash
docker-compose up -d
```

第一次啟動會自動執行 schema 建立和種子資料匯入。

### 3. 確認服務狀態

```bash
docker-compose ps
docker-compose logs -f backend
```

服務啟動後瀏覽器開啟 `http://your-truenas-ip`

---

## TrueNAS 部署建議

### 資料持久化
編輯 `docker-compose.yml`，將 volumes 映射到 TrueNAS 的資料集：

```yaml
volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/tank/studio-pm/postgres

  uploads_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/tank/studio-pm/uploads
```

先建立目錄：
```bash
mkdir -p /mnt/tank/studio-pm/{postgres,uploads}
```

### 備份

```bash
# 備份資料庫
docker exec studio-pm-db pg_dump -U studio studio_pm > backup_$(date +%Y%m%d).sql

# 還原
cat backup_20250507.sql | docker exec -i studio-pm-db psql -U studio studio_pm
```

---

## 開發環境

### 啟動後端

```bash
cd backend
npm install
cp ../.env.example .env  # 調整 DB 連線設定
npm run dev
```

### 啟動前端

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:3001/api npm run dev
```

---

## API 文件

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/projects | 所有專案 |
| POST | /api/projects | 建立專案 |
| PUT | /api/projects/:id | 更新專案 |
| DELETE | /api/projects/:id | 刪除專案 |
| GET | /api/tasks?project_id= | 任務列表 |
| POST | /api/tasks | 建立任務 |
| GET | /api/team-members | 成員列表 |
| POST | /api/time-allocations | 指派成員到任務 |
| POST | /api/time-allocations/check-conflicts | 衝突偵測 |
| GET | /api/contracts | 合約列表 |
| GET | /api/invoices | 發票列表 |
| POST | /api/invoices/generate | 自動計費預覽 |
| GET | /api/invoices/:id/pdf | 下載 PDF |
| GET | /api/health | 健康檢查 |

---

## 技術架構

```
frontend/   Next.js 14 + Tailwind CSS
backend/    Node.js + Express + PostgreSQL
nginx/      反向代理
postgres/   PostgreSQL 16
```

---

## 種子資料

系統預設包含：
- 3 個客戶（Pixelwave Studios、NeonDream Entertainment、TurboVFX Asia）
- 5 個示例專案
- 10 位團隊成員（繁中姓名，含美術、動畫、技術等角色）
- 示範分配時程（可直接在 Gantt 圖看到效果）
- 3 份合約 + 4 份發票（含不同狀態）
