/**
 * 對「已有資料」的 Postgres 補上 project_milestones / member_personal_tasks。
 * 用法（在 backend 目錄或帶 --prefix backend）： npm run db:migrate:milestones
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'src', 'db', 'migrations', '003_dashboard_milestones.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'studio_pm',
    user: process.env.DB_USER || 'studio',
    password: process.env.DB_PASSWORD || 'changeme',
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log('OK: applied', sqlPath);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
