require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'studio_pm',
  user: process.env.DB_USER || 'studio',
  password: process.env.DB_PASSWORD || 'changeme',
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error', err);
});

app.locals.db = pool;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('combined'));
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')));

app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/team-members', require('./routes/team-members'));
// New scheduling model endpoints
app.use('/api/allocations', require('./routes/allocations'));
// Alias route for member-specific allocation queries (keeps existing /api/team-members untouched)
app.use('/api/members', require('./routes/members'));
app.use('/api/time-allocations', require('./routes/time-allocations'));
app.use('/api/project-milestones', require('./routes/project-milestones'));
app.use('/api/personal-tasks', require('./routes/personal-tasks'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/quotation-services', require('./routes/quotation-services'));
app.use('/api/client-hubs', require('./routes/client-hubs'));
app.use('/api/public', require('./routes/public-client'));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'connected',
      routes: ['/api/clients', '/api/projects'],
    });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use((req, res) => {
  const hint =
    req.path === '/api/clients' || req.path.startsWith('/api/clients/')
      ? '若程式已含客戶路由仍出現此錯誤，請重啟後端；若使用 Docker，請執行 docker compose build backend && docker compose up -d backend'
      : '';
  res.status(404).json({ error: 'Not Found', path: req.path, method: req.method, hint });
});

app.use(require('./middleware/error-handler'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Studio PM API running on port ${PORT}`);
  console.log('[提示] 已掛載 /api/clients；若 POST 仍 404，代表跑的是舊行程，請重啟後端');
});
