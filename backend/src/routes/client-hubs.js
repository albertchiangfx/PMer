/**
 * 客戶協作 Hub（內部 API）
 *   GET    /?project_id=           依專案查詢（0 或 1 筆）
 *   POST   /                       為專案建立 hub
 *   GET    /:id
 *   PUT    /:id
 *   POST   /:id/regenerate-token   重設公開連結
 *   POST   /:id/links              新增外連
 *   DELETE /links/:linkId          刪除外連
 */
const express = require('express');
const router = express.Router();
const { newPublicToken } = require('../lib/public-token');
const studio = require('../contract-generator/studio-config');

async function loadHub(db, id) {
  const { rows } = await db.query(
    `SELECT h.*, p.name AS project_name, c.name AS client_name
       FROM client_hubs h
       JOIN projects p ON p.id = h.project_id
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE h.id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const hub = rows[0];
  const { rows: links } = await db.query(
    `SELECT * FROM client_hub_links WHERE hub_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [id]
  );
  return { ...hub, links };
}

/** 總覽：所有專案的客戶協作頁狀態 */
router.get('/overview', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { rows } = await db.query(
      `SELECT p.id AS project_id, p.name AS project_name, p.status AS project_status,
              p.color AS project_color,
              c.name AS client_name,
              h.id AS hub_id, h.public_token, h.is_active,
              h.first_viewed_at, h.last_viewed_at, h.welcome_message,
              (SELECT COUNT(*)::int FROM quotations q
                WHERE q.project_id = p.id AND q.client_visible = TRUE) AS published_quotes
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN client_hubs h ON h.project_id = p.id
        WHERE p.status NOT IN ('cancelled')
        ORDER BY h.last_viewed_at DESC NULLS LAST, p.updated_at DESC`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    const { rows } = await db.query(
      `SELECT h.*, p.name AS project_name, c.name AS client_name
         FROM client_hubs h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN clients c ON c.id = p.client_id
        WHERE h.project_id = $1`,
      [project_id]
    );
    if (!rows.length) return res.json(null);
    const hub = await loadHub(db, rows[0].id);
    res.json(hub);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const {
      project_id,
      title = null,
      welcome_message = null,
      studio_display_name = studio.name || null,
    } = req.body || {};
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const exists = await db.query(`SELECT id FROM client_hubs WHERE project_id = $1`, [project_id]);
    if (exists.rowCount) {
      const hub = await loadHub(db, exists.rows[0].id);
      return res.status(200).json(hub);
    }

    const token = newPublicToken();
    const { rows } = await db.query(
      `INSERT INTO client_hubs (project_id, public_token, title, welcome_message, studio_display_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [project_id, token, title, welcome_message, studio_display_name]
    );
    const hub = await loadHub(db, rows[0].id);
    res.status(201).json(hub);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const hub = await loadHub(req.app.locals.db, req.params.id);
    if (!hub) return res.status(404).json({ error: 'Hub not found' });
    res.json(hub);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { title, welcome_message, studio_display_name, is_active } = req.body || {};
    const { rowCount } = await db.query(
      `UPDATE client_hubs SET
         title = COALESCE($1, title),
         welcome_message = COALESCE($2, welcome_message),
         studio_display_name = COALESCE($3, studio_display_name),
         is_active = COALESCE($4, is_active)
       WHERE id = $5`,
      [title, welcome_message, studio_display_name, is_active, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Hub not found' });
    const hub = await loadHub(db, req.params.id);
    res.json(hub);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/regenerate-token', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const token = newPublicToken();
    const { rowCount } = await db.query(
      `UPDATE client_hubs SET public_token = $1 WHERE id = $2`,
      [token, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Hub not found' });
    const hub = await loadHub(db, req.params.id);
    res.json(hub);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/links', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { kind = 'other', label, url, sort_order = 0 } = req.body || {};
    if (!label || !url) return res.status(400).json({ error: 'label and url are required' });
    const hubCheck = await db.query(`SELECT id FROM client_hubs WHERE id = $1`, [req.params.id]);
    if (!hubCheck.rowCount) return res.status(404).json({ error: 'Hub not found' });
    const { rows } = await db.query(
      `INSERT INTO client_hub_links (hub_id, kind, label, url, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, kind, label, url, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/links/:linkId', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query(
      `DELETE FROM client_hub_links WHERE id = $1`,
      [req.params.linkId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Link not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
