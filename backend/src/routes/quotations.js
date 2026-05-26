/**
 * 報價單 API
 *   GET    /                       列表（filter: status / client_id / project_id）
 *   GET    /:id                    取得單張 + items
 *   POST   /                       建立（items 為陣列）
 *   PUT    /:id                    更新（含 items 全量取代）
 *   DELETE /:id                    刪除
 *   POST   /:id/clone              複製成新的草稿
 *   POST   /:id/preview-html       回傳完整 HTML
 *   POST   /:id/generate-pdf       產 PDF，存 uploads，回傳檔案
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const { renderQuotation } = require('../quote-generator/render');
const { htmlToPdf } = require('../contract-generator/pdf');

function dec(v, fallback = 0) {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function computeTotals(items, taxRate) {
  let subtotal = 0;
  for (const it of items || []) {
    const lt = round2(dec(it.qty, 0) * dec(it.unit_price, 0));
    it.line_total = lt;
    subtotal += lt;
  }
  subtotal = round2(subtotal);
  const tax = round2(subtotal * dec(taxRate, 0));
  const total = round2(subtotal + tax);
  return { subtotal, tax, total };
}

async function nextQuoteNumber(db) {
  const today = new Date();
  const ymd =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `Q-${ymd}-`;
  const { rows } = await db.query(
    `SELECT quote_number FROM quotations WHERE quote_number LIKE $1 ORDER BY quote_number DESC LIMIT 1`,
    [prefix + '%']
  );
  let next = 1;
  if (rows[0]?.quote_number) {
    const m = String(rows[0].quote_number).match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return prefix + String(next).padStart(3, '0');
}

async function loadQuotationWithItems(db, id) {
  const { rows } = await db.query(
    `SELECT q.*, p.name AS project_name, c.name AS client_name,
            c.address AS client_address, c.contact_email AS client_contact_email,
            c.contact_phone AS client_contact_phone,
            p.start_date AS project_start_date, p.end_date AS project_end_date
       FROM quotations q
       LEFT JOIN projects p ON p.id = q.project_id
       LEFT JOIN clients c ON c.id = q.client_id
       WHERE q.id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const { rows: items } = await db.query(
    `SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [id]
  );
  return { ...row, items };
}

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, project_id, client_id } = req.query;
    let q = `
      SELECT q.*, p.name AS project_name, c.name AS client_name
        FROM quotations q
        LEFT JOIN projects p ON p.id = q.project_id
        LEFT JOIN clients c ON c.id = q.client_id
       WHERE 1=1
    `;
    const params = [];
    if (status) {
      params.push(status);
      q += ` AND q.status = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      q += ` AND q.project_id = $${params.length}`;
    }
    if (client_id) {
      params.push(client_id);
      q += ` AND q.client_id = $${params.length}`;
    }
    q += ' ORDER BY q.created_at DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await loadQuotationWithItems(req.app.locals.db, req.params.id);
    if (!data) return res.status(404).json({ error: 'Quotation not found' });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const {
      project_id = null,
      client_id = null,
      quote_number,
      title = null,
      status = 'draft',
      currency = 'TWD',
      issued_date = null,
      valid_until = null,
      tax_rate = 0.05,
      notes = null,
      items = [],
    } = req.body || {};

    const qNumber = quote_number || (await nextQuoteNumber(client));
    const { subtotal, tax, total } = computeTotals(items, tax_rate);

    const { rows } = await client.query(
      `INSERT INTO quotations
         (project_id, client_id, quote_number, title, status, currency, issued_date, valid_until,
          subtotal, tax_rate, tax_due, total, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        project_id,
        client_id,
        qNumber,
        title,
        status,
        currency,
        issued_date,
        valid_until,
        subtotal,
        tax_rate,
        tax,
        total,
        notes,
      ]
    );
    const newId = rows[0].id;
    let sort = 0;
    for (const it of items || []) {
      await client.query(
        `INSERT INTO quotation_items
            (quotation_id, service_id, section_label, name, description, qty, unit_price, line_total, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          newId,
          it.service_id || null,
          it.section_label || '',
          it.name || '',
          it.description || null,
          dec(it.qty, 1),
          dec(it.unit_price, 0),
          dec(it.line_total, 0),
          it.sort_order != null ? it.sort_order : sort++,
        ]
      );
    }
    await client.query('COMMIT');
    const full = await loadQuotationWithItems(db, newId);
    res.status(201).json(full);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const {
      project_id,
      client_id,
      quote_number,
      title,
      status,
      currency,
      issued_date,
      valid_until,
      tax_rate,
      notes,
      pdf_path,
      items,
    } = req.body || {};

    const existing = await client.query('SELECT * FROM quotations WHERE id = $1 FOR UPDATE', [
      req.params.id,
    ]);
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Quotation not found' });
    }
    const prev = existing.rows[0];

    const newRate = tax_rate != null ? dec(tax_rate, prev.tax_rate) : Number(prev.tax_rate);
    const newItems = Array.isArray(items) ? items : null;
    let totals = {
      subtotal: Number(prev.subtotal),
      tax: Number(prev.tax_due),
      total: Number(prev.total),
    };
    if (newItems) {
      const t = computeTotals(newItems, newRate);
      totals = { subtotal: t.subtotal, tax: t.tax, total: t.total };
    } else if (tax_rate != null) {
      // 改 rate 但不改 items
      totals.tax = round2(totals.subtotal * newRate);
      totals.total = round2(totals.subtotal + totals.tax);
    }

    const { rows } = await client.query(
      `UPDATE quotations SET
         project_id  = COALESCE($1, project_id),
         client_id   = COALESCE($2, client_id),
         quote_number= COALESCE($3, quote_number),
         title       = $4,
         status      = COALESCE($5, status),
         currency    = COALESCE($6, currency),
         issued_date = $7,
         valid_until = $8,
         tax_rate    = $9,
         subtotal    = $10,
         tax_due     = $11,
         total       = $12,
         notes       = $13,
         pdf_path    = COALESCE($14, pdf_path)
       WHERE id = $15
       RETURNING *`,
      [
        project_id ?? null,
        client_id ?? null,
        quote_number ?? null,
        title ?? null,
        status ?? null,
        currency ?? null,
        issued_date ?? null,
        valid_until ?? null,
        newRate,
        totals.subtotal,
        totals.tax,
        totals.total,
        notes ?? null,
        pdf_path ?? null,
        req.params.id,
      ]
    );

    if (newItems) {
      await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [req.params.id]);
      let sort = 0;
      for (const it of newItems) {
        await client.query(
          `INSERT INTO quotation_items
              (quotation_id, service_id, section_label, name, description, qty, unit_price, line_total, sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            req.params.id,
            it.service_id || null,
            it.section_label || '',
            it.name || '',
            it.description || null,
            dec(it.qty, 1),
            dec(it.unit_price, 0),
            dec(it.line_total, 0),
            it.sort_order != null ? it.sort_order : sort++,
          ]
        );
      }
    }

    await client.query('COMMIT');
    const full = await loadQuotationWithItems(db, rows[0].id);
    res.json(full);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM quotations WHERE id = $1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Quotation not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

router.post('/:id/clone', async (req, res, next) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    const src = await loadQuotationWithItems(db, req.params.id);
    if (!src) return res.status(404).json({ error: 'Quotation not found' });
    const newNumber = await nextQuoteNumber(db);
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO quotations
         (project_id, client_id, quote_number, title, status, currency, issued_date, valid_until,
          subtotal, tax_rate, tax_due, total, notes)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.body?.project_id ?? src.project_id,
        req.body?.client_id ?? src.client_id,
        newNumber,
        src.title,
        src.currency,
        req.body?.issued_date ?? null,
        req.body?.valid_until ?? null,
        src.subtotal,
        src.tax_rate,
        src.tax_due,
        src.total,
        src.notes,
      ]
    );
    const newId = rows[0].id;
    let sort = 0;
    for (const it of src.items || []) {
      await client.query(
        `INSERT INTO quotation_items
            (quotation_id, service_id, section_label, name, description, qty, unit_price, line_total, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          newId,
          it.service_id || null,
          it.section_label || '',
          it.name || '',
          it.description || null,
          it.qty,
          it.unit_price,
          it.line_total,
          sort++,
        ]
      );
    }
    await client.query('COMMIT');
    const full = await loadQuotationWithItems(db, newId);
    res.status(201).json(full);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

function buildRenderContext(row) {
  return {
    quotation: {
      id: row.id,
      quote_number: row.quote_number,
      title: row.title,
      status: row.status,
      currency: row.currency,
      issued_date: row.issued_date,
      valid_until: row.valid_until,
      subtotal: row.subtotal,
      tax_rate: row.tax_rate,
      tax_due: row.tax_due,
      total: row.total,
      notes: row.notes,
      items: row.items,
    },
    client: {
      id: row.client_id,
      name: row.client_name,
      address: row.client_address,
      contact_email: row.client_contact_email,
      contact_phone: row.client_contact_phone,
    },
    project: {
      id: row.project_id,
      name: row.project_name,
      start_date: row.project_start_date,
      end_date: row.project_end_date,
    },
  };
}

router.get('/:id/preview-html', async (req, res, next) => {
  try {
    const data = await loadQuotationWithItems(req.app.locals.db, req.params.id);
    if (!data) return res.status(404).json({ error: 'Quotation not found' });
    const html = renderQuotation(buildRenderContext(data));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/preview-html', async (req, res, next) => {
  // 兼容前端用 POST
  try {
    const data = await loadQuotationWithItems(req.app.locals.db, req.params.id);
    if (!data) return res.status(404).json({ error: 'Quotation not found' });
    const html = renderQuotation(buildRenderContext(data));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/generate-pdf', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const data = await loadQuotationWithItems(db, req.params.id);
    if (!data) return res.status(404).json({ error: 'Quotation not found' });
    const html = renderQuotation(buildRenderContext(data));
    const pdf = await htmlToPdf(html);

    let filePath = null;
    const downloadOnly = req.body?.download_only === true || req.query.download_only === 'true';
    if (!downloadOnly) {
      try {
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const fname = `quotation-${data.quote_number || req.params.id}-${Date.now()}.pdf`;
        const abs = path.join(UPLOAD_DIR, fname);
        fs.writeFileSync(abs, pdf);
        filePath = `/uploads/${fname}`;
        await db.query('UPDATE quotations SET pdf_path = $1 WHERE id = $2', [
          filePath,
          req.params.id,
        ]);
      } catch (err) {
        console.error('[quotations] failed to persist PDF:', err.message);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="quotation-${data.quote_number || req.params.id}.pdf"`
    );
    if (filePath) res.setHeader('X-Saved-Path', filePath);
    res.send(pdf);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
