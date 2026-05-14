#!/usr/bin/env bash
# 將正式庫複製到 dev 庫（預設 studio_pm → studio_pm_dev），供 backend-dev 使用。
# 用法：在 repo 根目錄執行  ./scripts/clone-db-to-dev.sh
# 需先：docker compose up -d postgres
set -euo pipefail
cd "$(dirname "$0")/.."

U="${DB_USER:-studio}"
SRC="${DB_NAME:-studio_pm}"
DST="${DB_DEV_NAME:-studio_pm_dev}"

echo "==> 將 ${SRC} 複製到 ${DST}（使用者 ${U}）…"

docker compose exec -T postgres psql -U "$U" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DST}' AND pid <> pg_backend_pid();" 2>/dev/null || true
docker compose exec -T postgres psql -U "$U" -d postgres -c "DROP DATABASE IF EXISTS ${DST};"
docker compose exec -T postgres psql -U "$U" -d postgres -c "CREATE DATABASE ${DST} OWNER ${U};"

docker compose exec -T postgres pg_dump -U "$U" --no-owner "$SRC" \
  | docker compose exec -T postgres psql -U "$U" -d "$DST"

echo "==> 完成。請重啟 dev 後端： docker compose up -d backend-dev"
