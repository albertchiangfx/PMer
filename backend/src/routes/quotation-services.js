/**
 * 服務項目庫：報價單時可勾選的「預先建好的項目 + 預設單價」
 */
const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { active } = req.query;
    let q = 'SELECT * FROM quotation_services WHERE 1=1';
    const params = [];
    if (active === 'true') q += ' AND is_active = TRUE';
    else if (active === 'false') q += ' AND is_active = FALSE';
    q += ' ORDER BY sort_order ASC, created_at ASC';
    const { rows } = await req.app.locals.db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await req.app.locals.db.query(
      'SELECT * FROM quotation_services WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Service not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      section_label = '',
      name,
      description = null,
      default_unit_price = 0,
      currency = 'TWD',
      sort_order = 0,
      is_active = true,
    } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await req.app.locals.db.query(
      `INSERT INTO quotation_services (section_label, name, description, default_unit_price, currency, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [section_label, name, description, default_unit_price, currency, sort_order, is_active]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const {
      section_label,
      name,
      description,
      default_unit_price,
      currency,
      sort_order,
      is_active,
    } = req.body || {};
    const { rows } = await req.app.locals.db.query(
      `UPDATE quotation_services SET
         section_label = COALESCE($1, section_label),
         name = COALESCE($2, name),
         description = $3,
         default_unit_price = COALESCE($4, default_unit_price),
         currency = COALESCE($5, currency),
         sort_order = COALESCE($6, sort_order),
         is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [
        section_label,
        name,
        description,
        default_unit_price,
        currency,
        sort_order,
        is_active,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Service not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query(
      'DELETE FROM quotation_services WHERE id = $1',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Service not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
