const express = require('express');
const router = express.Router();
const { fetchProjectBounds, clampProjectDescendantsToBounds } = require('../lib/projectDateBounds');
const { ensureProjectFinancialPlaceholders } = require('../lib/ensure-project-financials');

/** Postgres DATE rejects ''; JSON often sends "" when inputs are cleared. */
function dateOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, client_id } = req.query;
    let q = `
      SELECT p.*, c.name AS client_name,
        COUNT(DISTINCT t.id) AS task_count,
        COUNT(DISTINCT na.id) AS allocation_count
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN tasks t ON t.project_id = p.id
      LEFT JOIN allocations na ON na.project_id = p.id
    `;
    const params = [];
    const where = [];
    if (status) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    if (client_id) {
      params.push(client_id);
      where.push(`p.client_id = $${params.length}`);
    }
    if (where.length) q += ` WHERE ${where.join(' AND ')}`;
    q += ' GROUP BY p.id, c.name ORDER BY p.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { rows } = await db.query(
      `
      SELECT p.*, c.name AS client_name, c.contact_email AS client_email
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = $1
    `,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    try {
      await ensureProjectFinancialPlaceholders(db, rows[0]);
    } catch (e) {
      console.error('[projects GET :id] ensure financials', e.message);
    }
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { name, client_id, description, budget, status, start_date, end_date, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
      `
      INSERT INTO projects (name, client_id, description, budget, status, start_date, end_date, color)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `,
      [
        name,
        client_id || null,
        description,
        budget === '' || budget === undefined ? null : budget,
        status || 'planning',
        dateOrNull(start_date),
        dateOrNull(end_date),
        color || '#6366f1',
      ]
    );
    await db.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, changed_by) VALUES ('project',$1,'create','system')`,
      [rows[0].id]
    );
    try {
      await ensureProjectFinancialPlaceholders(db, rows[0]);
    } catch (e) {
      console.error('[projects POST] ensure financials', e.message);
    }
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  const db = req.app.locals.db;
  const { name, client_id, description, budget, status, start_date, end_date, color } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `
      UPDATE projects SET name=$1, client_id=$2, description=$3, budget=$4, status=$5,
        start_date=$6, end_date=$7, color=$8 WHERE id=$9 RETURNING *
    `,
      [
        name,
        client_id || null,
        description,
        budget === '' || budget === undefined ? null : budget,
        status,
        dateOrNull(start_date),
        dateOrNull(end_date),
        color,
        req.params.id,
      ]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }
    const bounds = await fetchProjectBounds(client, req.params.id);
    if (bounds) await clampProjectDescendantsToBounds(client, req.params.id, bounds);
    try {
      await ensureProjectFinancialPlaceholders(client, rows[0]);
    } catch (e) {
      console.error('[projects PUT] ensure financials', e.message);
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    next(e);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM projects WHERE id=$1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Project not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// GET /api/projects/:id/allocations
// Returns all allocations for this project, enriched with member details.
router.get('/:id/allocations', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { from, to } = req.query;
    let q = `
      SELECT a.*,
        tm.name AS member_name, tm.role AS member_role, tm.avatar_color, tm.hourly_rate
      FROM allocations a
      JOIN team_members tm ON tm.id = a.member_id
      WHERE a.project_id = $1
    `;
    const params = [req.params.id];
    if (from) {
      params.push(from);
      q += ` AND a.end_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      q += ` AND a.start_date <= $${params.length}`;
    }
    q += ' ORDER BY a.start_date, tm.name';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Get all clients (for project forms)
router.get('/meta/clients', async (req, res, next) => {
  try {
    const { rows } = await req.app.locals.db.query('SELECT * FROM clients ORDER BY name');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
