const express = require('express');
const router = express.Router();
const { getTemplateLabels, listTemplateKeys } = require('../lib/milestone-templates');

/** Summary: { [project_id]: { total, completed } } */
router.get('/by-projects', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const raw = req.query.ids || '';
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return res.json({});
    const { rows } = await db.query(
      `
      SELECT project_id::text,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE completed)::int AS completed
      FROM project_milestones
      WHERE project_id = ANY($1::uuid[])
      GROUP BY project_id
      `,
      [ids]
    );
    const map = {};
    for (const r of rows) {
      map[r.project_id] = { total: r.total, completed: r.completed };
    }
    res.json(map);
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    const { rows } = await db.query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [project_id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, label, sort_order } = req.body;
    if (!project_id || !label) return res.status(400).json({ error: 'project_id and label are required' });
    let order = sort_order;
    if (order == null) {
      const { rows } = await db.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM project_milestones WHERE project_id = $1`,
        [project_id]
      );
      order = rows[0].n;
    }
    const { rows } = await db.query(
      `INSERT INTO project_milestones (project_id, label, completed, sort_order)
       VALUES ($1,$2,false,$3) RETURNING *`,
      [project_id, label, order]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { completed, label, sort_order } = req.body;
    const fields = [];
    const params = [];
    let i = 1;
    if (completed !== undefined) {
      fields.push(`completed = $${i++}`);
      params.push(!!completed);
    }
    if (label !== undefined) {
      fields.push(`label = $${i++}`);
      params.push(label);
    }
    if (sort_order !== undefined) {
      fields.push(`sort_order = $${i++}`);
      params.push(sort_order);
    }
    if (!fields.length) return res.status(400).json({ error: 'no updates' });
    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE project_milestones SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Milestone not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query(`DELETE FROM project_milestones WHERE id = $1`, [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Milestone not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.post('/reorder', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { ordered_ids } = req.body;
    if (!Array.isArray(ordered_ids) || !ordered_ids.length) {
      return res.status(400).json({ error: 'ordered_ids array required' });
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ordered_ids.length; i++) {
        await client.query(`UPDATE project_milestones SET sort_order = $1 WHERE id = $2`, [i, ordered_ids[i]]);
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

/** Insert "Final Edit NN" immediately before the Final Delivery milestone */
router.post('/add-final-edit-round', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const { rows } = await db.query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [project_id]
    );
    const deliveryIdx = rows.findIndex((r) => /final\s*delivery/i.test(String(r.label)));
    if (deliveryIdx === -1) {
      return res.status(400).json({ error: '找不到「Final Delivery」里程碑（請先套用廣告製作公版或手動新增）' });
    }

    const delivery = rows[deliveryIdx];
    const before = rows.slice(0, deliveryIdx);
    let maxN = 0;
    const re = /^final\s*edit\s*0*(\d+)\s*$/i;
    for (const r of before) {
      const m = String(r.label).trim().match(re);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    const nextN = maxN + 1;
    const label = `Final Edit ${String(nextN).padStart(2, '0')}`;
    const insertOrder = delivery.sort_order;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE project_milestones SET sort_order = sort_order + 1
         WHERE project_id = $1 AND sort_order >= $2`,
        [project_id, insertOrder]
      );
      const ins = await client.query(
        `INSERT INTO project_milestones (project_id, label, completed, sort_order)
         VALUES ($1,$2,false,$3) RETURNING *`,
        [project_id, label, insertOrder]
      );
      await client.query('COMMIT');
      res.status(201).json(ins.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

router.post('/bootstrap', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, template } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    const labels = getTemplateLabels(template || 'generic');
    if (!labels) return res.status(400).json({ error: `unknown template; use one of: ${listTemplateKeys().join(', ')}` });

    const { rows: existing } = await db.query(
      `SELECT COUNT(*)::int AS n FROM project_milestones WHERE project_id = $1`,
      [project_id]
    );
    if (existing[0].n > 0) {
      return res.status(409).json({ error: 'Project already has milestones; delete them first or add manually' });
    }

    const inserted = [];
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < labels.length; i++) {
        const { rows } = await client.query(
          `INSERT INTO project_milestones (project_id, label, completed, sort_order)
           VALUES ($1,$2,false,$3) RETURNING *`,
          [project_id, labels[i], i]
        );
        inserted.push(rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json(inserted);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

module.exports = router;
