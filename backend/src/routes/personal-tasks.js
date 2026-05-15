const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { member_id, project_id } = req.query;
    if (!member_id) return res.status(400).json({ error: 'member_id is required' });
    let q = `
      SELECT pt.*, p.name AS project_name, p.color AS project_color
      FROM member_personal_tasks pt
      JOIN projects p ON p.id = pt.project_id
      WHERE pt.team_member_id = $1
    `;
    const params = [member_id];
    if (project_id) {
      params.push(project_id);
      q += ` AND pt.project_id = $${params.length}`;
    }
    q += ' ORDER BY pt.urgent DESC, pt.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { team_member_id, project_id, title } = req.body;
    if (!team_member_id || !project_id || !title) {
      return res.status(400).json({ error: 'team_member_id, project_id, title are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO member_personal_tasks (team_member_id, project_id, title, urgent)
       VALUES ($1,$2,$3,false) RETURNING *`,
      [team_member_id, project_id, title.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { title, urgent } = req.body;
    const fields = [];
    const params = [];
    let i = 1;
    if (title !== undefined) {
      fields.push(`title = $${i++}`);
      params.push(title);
    }
    if (urgent !== undefined) {
      fields.push(`urgent = $${i++}`);
      params.push(!!urgent);
    }
    if (!fields.length) return res.status(400).json({ error: 'no updates' });
    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE member_personal_tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query(
      `DELETE FROM member_personal_tasks WHERE id = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
