const express = require('express');
const router = express.Router();
const { fetchProjectBounds, assertIntervalWithinBounds } = require('../lib/projectDateBounds');

function normalizeDateRange(start, end) {
  if (!start || !end) return null;
  return { start_date: start, end_date: end };
}

async function detectConflicts(db, memberId, startDate, endDate, excludeId = null) {
  // Overlap: existing.start <= new.end AND existing.end >= new.start
  let q = `
    SELECT a.*, p.name AS project_name, p.color AS project_color
    FROM allocations a
    JOIN projects p ON p.id = a.project_id
    WHERE a.member_id = $1
      AND a.start_date <= $3 AND a.end_date >= $2
  `;
  const params = [memberId, startDate, endDate];
  if (excludeId) {
    params.push(excludeId);
    q += ` AND a.id != $${params.length}`;
  }
  q += ' ORDER BY a.start_date';
  const { rows } = await db.query(q, params);
  return rows;
}

// GET /api/allocations?project_id=&member_id=&from=&to=
router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, member_id, from, to } = req.query;
    let q = `
      SELECT a.*,
        p.name AS project_name, c.name AS project_client_name, p.color AS project_color,
        tm.name AS member_name, tm.role AS member_role, tm.avatar_color, tm.hourly_rate
      FROM allocations a
      JOIN projects p ON p.id = a.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      JOIN team_members tm ON tm.id = a.member_id
      WHERE 1=1
    `;
    const params = [];
    if (project_id) {
      params.push(project_id);
      q += ` AND a.project_id = $${params.length}`;
    }
    if (member_id) {
      params.push(member_id);
      q += ` AND a.member_id = $${params.length}`;
    }
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

// POST /api/allocations
router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, member_id, start_date, end_date, notes } = req.body;
    if (!project_id || !member_id)
      return res.status(400).json({ error: 'project_id and member_id are required' });
    const range = normalizeDateRange(start_date, end_date);
    if (!range) return res.status(400).json({ error: 'start_date and end_date are required' });

    const bounds = await fetchProjectBounds(db, project_id);
    const boundErr = assertIntervalWithinBounds(range.start_date, range.end_date, bounds);
    if (boundErr) return res.status(400).json({ error: boundErr });

    const conflicts = await detectConflicts(db, member_id, range.start_date, range.end_date);
    const { rows } = await db.query(
      `INSERT INTO allocations (project_id, member_id, start_date, end_date, notes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [project_id, member_id, range.start_date, range.end_date, notes]
    );
    // Allow overlaps; return conflicts for UI warnings.
    res.status(201).json({ ...rows[0], conflicts });
  } catch (e) {
    next(e);
  }
});

// PUT /api/allocations/:id
router.put('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const cur = await db.query('SELECT * FROM allocations WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Allocation not found' });
    const row = cur.rows[0];

    const project_id = req.body.project_id ?? row.project_id;
    const member_id = req.body.member_id ?? row.member_id;
    const start_date = req.body.start_date ?? row.start_date;
    const end_date = req.body.end_date ?? row.end_date;
    const notes = req.body.notes !== undefined ? req.body.notes : row.notes;

    const range = normalizeDateRange(start_date, end_date);
    if (!range) return res.status(400).json({ error: 'start_date and end_date are required' });

    const bounds = await fetchProjectBounds(db, project_id);
    const boundErr = assertIntervalWithinBounds(range.start_date, range.end_date, bounds);
    if (boundErr) return res.status(400).json({ error: boundErr });

    const conflicts = await detectConflicts(
      db,
      member_id,
      range.start_date,
      range.end_date,
      req.params.id
    );
    const { rows } = await db.query(
      `UPDATE allocations
       SET project_id=$1, member_id=$2, start_date=$3, end_date=$4, notes=$5
       WHERE id=$6
       RETURNING *`,
      [project_id, member_id, range.start_date, range.end_date, notes, req.params.id]
    );
    res.json({ ...rows[0], conflicts });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/allocations/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM allocations WHERE id=$1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Allocation not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// GET /api/allocations/check-conflicts?member_id=&start_date=&end_date=&exclude_id=
router.get('/check-conflicts', async (req, res, next) => {
  try {
    const { member_id, start_date, end_date, exclude_id } = req.query;
    if (!member_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'member_id, start_date, end_date are required' });
    }
    const conflicts = await detectConflicts(
      req.app.locals.db,
      member_id,
      start_date,
      end_date,
      exclude_id || null
    );
    res.json({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (e) {
    next(e);
  }
});

// Back-compat: POST /api/allocations/check-conflicts
router.post('/check-conflicts', async (req, res, next) => {
  try {
    const { member_id, start_date, end_date, exclude_id } = req.body;
    if (!member_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'member_id, start_date, end_date are required' });
    }
    const conflicts = await detectConflicts(
      req.app.locals.db,
      member_id,
      start_date,
      end_date,
      exclude_id || null
    );
    res.json({ hasConflicts: conflicts.length > 0, conflicts });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
