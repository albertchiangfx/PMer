const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ts = Date.now();
    cb(null, `contract-${ts}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });
const { ensureBackfillOnce } = require('../lib/ensure-project-financials');
const generator = require('../contract-generator');
const { renderContract } = require('../contract-generator/render');
const { htmlToPdf } = require('../contract-generator/pdf');

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    await ensureBackfillOnce(db);
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

router.get('/generator/options', (req, res) => {
  res.json({
    templates: generator.listTemplates(),
    clauses: generator.listClauses(),
  });
});

async function loadContractContext(db, id) {
  const { rows } = await db.query(
    `
    SELECT c.*, p.name AS project_name, p.start_date AS project_start_date,
           p.end_date AS project_end_date,
           cl.name AS client_name, cl.address AS client_address,
           cl.contact_email AS client_contact_email,
           cl.contact_phone AS client_contact_phone
    FROM contracts c
    JOIN projects p ON p.id = c.project_id
    JOIN clients cl ON cl.id = c.client_id
    WHERE c.id = $1
  `,
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    contract: {
      id: r.id,
      contract_number: r.contract_number,
      amount: r.amount,
      currency: r.currency,
      signed_date: r.signed_date,
      effective_date: r.effective_date,
      expiry_date: r.expiry_date,
      status: r.status,
      notes: r.notes,
    },
    client: {
      id: r.client_id,
      name: r.client_name,
      address: r.client_address,
      contact_email: r.client_contact_email,
      contact_phone: r.client_contact_phone,
    },
    project: {
      id: r.project_id,
      name: r.project_name,
      start_date: r.project_start_date,
      end_date: r.project_end_date,
    },
  };
}

router.post('/:id/preview-html', async (req, res, next) => {
  try {
    const ctx = await loadContractContext(req.app.locals.db, req.params.id);
    if (!ctx) return res.status(404).json({ error: 'Contract not found' });
    const { template_id, clause_ids = [] } = req.body || {};
    if (!template_id) return res.status(400).json({ error: 'template_id is required' });
    const html = renderContract({ templateId: template_id, clauseIds: clause_ids, ...ctx });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/generate-pdf', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const ctx = await loadContractContext(db, req.params.id);
    if (!ctx) return res.status(404).json({ error: 'Contract not found' });
    const { template_id, clause_ids = [], download_only = false } = req.body || {};
    if (!template_id) return res.status(400).json({ error: 'template_id is required' });

    const html = renderContract({ templateId: template_id, clauseIds: clause_ids, ...ctx });
    const pdf = await htmlToPdf(html);

    let filePath = null;
    if (!download_only) {
      try {
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const fname = `contract-${ctx.contract.contract_number || req.params.id}-${Date.now()}.pdf`;
        const absPath = path.join(UPLOAD_DIR, fname);
        fs.writeFileSync(absPath, pdf);
        filePath = `/uploads/${fname}`;
        await db.query('UPDATE contracts SET file_path=$1, updated_at=NOW() WHERE id=$2', [
          filePath,
          req.params.id,
        ]);
      } catch (err) {
        console.error('[contracts] failed to persist generated PDF:', err.message);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contract-${ctx.contract.contract_number || req.params.id}.pdf"`
    );
    if (filePath) res.setHeader('X-Saved-Path', filePath);
    res.send(pdf);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
