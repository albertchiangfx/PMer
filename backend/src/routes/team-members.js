const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status } = req.query;
    let q = `
      SELECT tm.*,
        COUNT(DISTINCT a.id) AS active_allocations,
        COALESCE(SUM(
          CASE
            WHEN a.start_date IS NOT NULL AND a.end_date IS NOT NULL
            THEN ((a.end_date::date - a.start_date::date) + 1) * 8
            ELSE 0
          END
        ), 0) AS total_allocated_hours
      FROM team_members tm
      LEFT JOIN allocations a ON a.member_id = tm.id
        AND a.end_date >= CURRENT_DATE
    `;
    const params = [];
    const wheres = [];
    if (status) {
      wheres.push(`tm.status = $${params.length + 1}`);
      params.push(status);
    }

    // Non-admins can only see themselves.
    if (req.user?.role !== 'admin') {
      wheres.push(`tm.user_id = $${params.length + 1}`);
      params.push(req.user?.id || null);
    }

    if (wheres.length) q += ` WHERE ${wheres.join(' AND ')}`;
    q += ' GROUP BY tm.id ORDER BY tm.name';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await req.app.locals.db.query('SELECT * FROM team_members WHERE id=$1', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Team member not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// employment_type accepts only 'permanent' or 'freelance'; anything else falls back to 'permanent'.
const normalizeEmploymentType = (v) => (v === 'freelance' ? 'freelance' : 'permanent');

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { name, role, hourly_rate, status, email, phone, avatar_color, employment_type, user_id } =
      req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const colors = [
      '#6366f1',
      '#8b5cf6',
      '#ec4899',
      '#f59e0b',
      '#10b981',
      '#3b82f6',
      '#ef4444',
      '#14b8a6',
    ];
    const color = avatar_color || colors[Math.floor(Math.random() * colors.length)];
    const uid = req.user?.role === 'admin' ? user_id || null : null;
    const { rows } = await db.query(
      `
      INSERT INTO team_members (user_id, name, role, hourly_rate, status, email, phone, avatar_color, employment_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `,
      [
        uid,
        name,
        role || 'Team Member',
        hourly_rate || 0,
        status || 'active',
        email,
        phone,
        color,
        normalizeEmploymentType(employment_type),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { name, role, hourly_rate, status, email, phone, avatar_color, employment_type, user_id } =
      req.body;
    const isAdmin = req.user?.role === 'admin';
    const uid = isAdmin ? (user_id === '' ? null : user_id || null) : null;
    const { rows } = await db.query(
      `
      UPDATE team_members
         SET name=$1,
             role=$2,
             hourly_rate=$3,
             status=$4,
             email=$5,
             phone=$6,
             avatar_color=$7,
             employment_type=$8,
             user_id = CASE WHEN $9 THEN $10 ELSE user_id END
       WHERE id=$11 RETURNING *
    `,
      [
        name,
        role,
        hourly_rate,
        status,
        email,
        phone,
        avatar_color,
        normalizeEmploymentType(employment_type),
        isAdmin,
        uid,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Team member not found' });
    res.json(rows[0]);
  } catch (e) {
    if (String(e?.code || '') === '23505') {
      return res.status(400).json({ error: '此使用者已被指派到其他成員' });
    }
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM team_members WHERE id=$1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Team member not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Get schedule for a member
router.get('/:id/schedule', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { from, to } = req.query;
    let q = `
      SELECT a.*,
        NULL::text AS task_name,
        p.name AS project_name,
        p.color AS project_color,
        a.member_id AS team_member_id
      FROM allocations a
      JOIN projects p ON p.id = a.project_id
      WHERE a.member_id = $1
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
    q += ' ORDER BY a.start_date';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
