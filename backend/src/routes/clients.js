const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await req.app.locals.db.query('SELECT * FROM clients ORDER BY name');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, contact_email, contact_phone, address } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await req.app.locals.db.query(
      `INSERT INTO clients (name, contact_email, contact_phone, address)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [String(name).trim(), contact_email || null, contact_phone || null, address || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '客戶名稱已存在' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, contact_email, contact_phone, address } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await req.app.locals.db.query(
      `UPDATE clients SET name=$1, contact_email=$2, contact_phone=$3, address=$4, updated_at=CURRENT_TIMESTAMP
       WHERE id=$5 RETURNING *`,
      [
        String(name).trim(),
        contact_email || null,
        contact_phone || null,
        address || null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '客戶名稱已存在' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { rows: cr } = await db.query(
      `SELECT COUNT(*)::int AS n FROM contracts WHERE client_id = $1`,
      [req.params.id]
    );
    if (cr[0]?.n > 0) {
      return res
        .status(409)
        .json({ error: '仍有合約綁定此客戶，請先刪除或變更合約後再刪除客戶。' });
    }
    const { rowCount } = await db.query(`DELETE FROM clients WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Client not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
