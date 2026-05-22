const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const ts = Date.now();
    cb(null, `contract-${ts}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, project_id, client_id } = req.query;
    let q = `
      SELECT c.*, p.name AS project_name, cl.name AS client_name
      FROM contracts c
      JOIN projects p ON p.id = c.project_id
      JOIN clients cl ON cl.id = c.client_id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      params.push(status);
      q += ` AND c.status = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      q += ` AND c.project_id = $${params.length}`;
    }
    if (client_id) {
      params.push(client_id);
      q += ` AND c.client_id = $${params.length}`;
    }
    q += ' ORDER BY c.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await req.app.locals.db.query(
      `
      SELECT c.*, p.name AS project_name, cl.name AS client_name
      FROM contracts c
      JOIN projects p ON p.id = c.project_id
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.id = $1
    `,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const {
      project_id,
      client_id,
      contract_number,
      amount,
      currency,
      signed_date,
      effective_date,
      expiry_date,
      status,
      notes,
    } = req.body;
    if (!project_id || !client_id || !amount)
      return res.status(400).json({ error: 'project_id, client_id, amount are required' });

    const file_path = req.file ? `/uploads/${req.file.filename}` : null;
    const cn = contract_number || `CNT-${Date.now()}`;

    const { rows } = await db.query(
      `
      INSERT INTO contracts (project_id, client_id, contract_number, amount, currency, signed_date, effective_date, expiry_date, status, file_path, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `,
      [
        project_id,
        client_id,
        cn,
        amount,
        currency || 'USD',
        signed_date,
        effective_date,
        expiry_date,
        status || 'draft',
        file_path,
        notes,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', upload.single('file'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const {
      contract_number,
      amount,
      currency,
      signed_date,
      effective_date,
      expiry_date,
      status,
      notes,
    } = req.body;
    const file_path = req.file ? `/uploads/${req.file.filename}` : undefined;

    const setClauses = [
      'contract_number=$1',
      'amount=$2',
      'currency=$3',
      'signed_date=$4',
      'effective_date=$5',
      'expiry_date=$6',
      'status=$7',
      'notes=$8',
    ];
    const params = [
      contract_number,
      amount,
      currency,
      signed_date,
      effective_date,
      expiry_date,
      status,
      notes,
    ];
    if (file_path !== undefined) {
      setClauses.push(`file_path=$${params.length + 1}`);
      params.push(file_path);
    }
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE contracts SET ${setClauses.join(',')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM contracts WHERE id=$1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Contract not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
