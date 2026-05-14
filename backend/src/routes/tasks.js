const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, team_member_id } = req.query;
    let q = `
      SELECT t.*, p.name AS project_name, p.color AS project_color,
        json_agg(json_build_object(
          'id', ta.id, 'team_member_id', ta.team_member_id,
          'member_name', tm.name, 'member_role', tm.role,
          'avatar_color', tm.avatar_color,
          'allocated_hours', ta.allocated_hours, 'allocated_days', ta.allocated_days,
          'start_date', ta.start_date, 'end_date', ta.end_date
        )) FILTER (WHERE ta.id IS NOT NULL) AS allocations
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN time_allocations ta ON ta.task_id = t.id
      LEFT JOIN team_members tm ON tm.id = ta.team_member_id
    `;
    const params = [];
    const cond = [];
    if (project_id) {
      params.push(project_id);
      cond.push(`t.project_id = $${params.length}`);
    }
    if (team_member_id) {
      params.push(team_member_id);
      cond.push(
        `EXISTS (SELECT 1 FROM time_allocations ta_m WHERE ta_m.task_id = t.id AND ta_m.team_member_id = $${params.length})`
      );
    }
    if (cond.length) q += ` WHERE ${cond.join(' AND ')}`;
    q += ' GROUP BY t.id, p.name, p.color ORDER BY t.order_index, t.start_date';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { rows } = await db.query(`
      SELECT t.*, p.name AS project_name, p.color AS project_color
      FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, name, description, task_type, status, priority, start_date, end_date, order_index } = req.body;
    if (!project_id || !name) return res.status(400).json({ error: 'project_id and name are required' });
    const { rows } = await db.query(`
      INSERT INTO tasks (project_id, name, description, task_type, status, priority, start_date, end_date, order_index)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [project_id, name, description, task_type || 'general', status || 'todo', priority || 'medium', start_date, end_date, order_index || 0]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { name, description, task_type, status, priority, start_date, end_date, order_index } = req.body;
    const { rows } = await db.query(`
      UPDATE tasks SET name=$1, description=$2, task_type=$3, status=$4, priority=$5,
        start_date=$6, end_date=$7, order_index=$8 WHERE id=$9 RETURNING *
    `, [name, description, task_type, status, priority, start_date, end_date, order_index, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
