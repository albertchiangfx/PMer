const express = require('express');
const router = express.Router();

// GET /api/members/:id/allocations
// Returns this member's allocations across all projects (duplicates allowed).
router.get('/:id/allocations', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { from, to } = req.query;
    let q = `
      SELECT a.*,
        p.name AS project_name, p.color AS project_color
      FROM allocations a
      JOIN projects p ON p.id = a.project_id
      WHERE a.member_id = $1
    `;
    const params = [req.params.id];
    if (from) { params.push(from); q += ` AND a.end_date >= $${params.length}`; }
    if (to) { params.push(to); q += ` AND a.start_date <= $${params.length}`; }
    q += ' ORDER BY a.start_date, p.name';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;

