const express = require('express');
const router = express.Router();
const { fetchProjectBounds, assertIntervalWithinBounds } = require('../lib/projectDateBounds');

// Conflict detection helper
async function detectConflicts(db, memberId, startDate, endDate, excludeId = null) {
  let q = `
    SELECT ta.*, t.name AS task_name, p.name AS project_name
    FROM time_allocations ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN projects p ON p.id = t.project_id
    WHERE ta.team_member_id = $1
      AND ta.start_date <= $3 AND ta.end_date >= $2
  `;
  const params = [memberId, startDate, endDate];
  if (excludeId) {
    params.push(excludeId);
    q += ` AND ta.id != $${params.length}`;
  }
  const { rows } = await db.query(q, params);
  return rows;
}

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { task_id, team_member_id, from, to } = req.query;
    let q = `
      SELECT ta.*, t.name AS task_name, t.status AS task_status,
        t.start_date AS task_start_date, t.end_date AS task_end_date,
        p.name AS project_name, p.color AS project_color, p.id AS project_id,
        tm.name AS member_name, tm.role AS member_role, tm.avatar_color, tm.hourly_rate
      FROM time_allocations ta
      JOIN tasks t ON t.id = ta.task_id
      JOIN projects p ON p.id = t.project_id
      JOIN team_members tm ON tm.id = ta.team_member_id
      WHERE 1=1
    `;
    const params = [];
    if (task_id) {
      params.push(task_id);
      q += ` AND ta.task_id = $${params.length}`;
    }
    if (team_member_id) {
      params.push(team_member_id);
      q += ` AND ta.team_member_id = $${params.length}`;
    }
    if (from) {
      params.push(from);
      q += ` AND ta.end_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      q += ` AND ta.start_date <= $${params.length}`;
    }
    q += ' ORDER BY ta.start_date, tm.name';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const {
      task_id,
      team_member_id,
      allocated_days,
      allocated_hours,
      start_date,
      end_date,
      notes,
    } = req.body;
    if (!task_id || !team_member_id)
      return res.status(400).json({ error: 'task_id and team_member_id are required' });

    if (start_date && end_date) {
      const t = await db.query('SELECT project_id FROM tasks WHERE id = $1', [task_id]);
      if (!t.rows.length) return res.status(404).json({ error: 'Task not found' });
      const bounds = await fetchProjectBounds(db, t.rows[0].project_id);
      const boundErr = assertIntervalWithinBounds(start_date, end_date, bounds);
      if (boundErr) return res.status(400).json({ error: boundErr });
    }

    const conflicts =
      start_date && end_date ? await detectConflicts(db, team_member_id, start_date, end_date) : [];

    const { rows } = await db.query(
      `
      INSERT INTO time_allocations (task_id, team_member_id, allocated_days, allocated_hours, start_date, end_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `,
      [
        task_id,
        team_member_id,
        allocated_days || 1,
        allocated_hours || 8,
        start_date,
        end_date,
        notes,
      ]
    );
    // 允許時段重疊（與專案 allocations 一致）；僅回傳 conflicts 供 UI 選擇性提示
    res.status(201).json({ ...rows[0], conflicts });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const {
      task_id,
      team_member_id,
      allocated_days,
      allocated_hours,
      start_date,
      end_date,
      notes,
    } = req.body;

    const cur = await db.query(
      'SELECT task_id, start_date, end_date FROM time_allocations WHERE id = $1',
      [req.params.id]
    );
    if (!cur.rows.length) return res.status(404).json({ error: 'Allocation not found' });
    const effTaskId = task_id != null ? task_id : cur.rows[0].task_id;
    const effStart = start_date != null ? start_date : cur.rows[0].start_date;
    const effEnd = end_date != null ? end_date : cur.rows[0].end_date;
    if (effStart && effEnd) {
      const t = await db.query('SELECT project_id FROM tasks WHERE id = $1', [effTaskId]);
      if (!t.rows.length) return res.status(404).json({ error: 'Task not found' });
      const bounds = await fetchProjectBounds(db, t.rows[0].project_id);
      const boundErr = assertIntervalWithinBounds(effStart, effEnd, bounds);
      if (boundErr) return res.status(400).json({ error: boundErr });
    }

    let conflicts = [];
    if (start_date && end_date && team_member_id) {
      conflicts = await detectConflicts(db, team_member_id, start_date, end_date, req.params.id);
    }

    const { rows } = await db.query(
      `
      UPDATE time_allocations SET task_id=$1, team_member_id=$2, allocated_days=$3,
        allocated_hours=$4, start_date=$5, end_date=$6, notes=$7
      WHERE id=$8 RETURNING *
    `,
      [
        task_id,
        team_member_id,
        allocated_days,
        allocated_hours,
        start_date,
        end_date,
        notes,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Allocation not found' });
    res.json({ ...rows[0], conflicts });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM time_allocations WHERE id=$1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Allocation not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Check conflicts without creating
router.post('/check-conflicts', async (req, res, next) => {
  try {
    const { team_member_id, start_date, end_date, exclude_id } = req.body;
    const conflicts = await detectConflicts(
      req.app.locals.db,
      team_member_id,
      start_date,
      end_date,
      exclude_id
    );
    res.json({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
