const express = require('express');
const router = express.Router();
const { generateInvoicePDF } = require('../utils/invoice-generator');
const { ensureBackfillOnce } = require('../lib/ensure-project-financials');

router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    await ensureBackfillOnce(db);
    const { status, project_id, client_id } = req.query;
    let q = `
      SELECT i.*, p.name AS project_name,
        COALESCE(cl_ct.name, cl_p.name) AS client_name,
        COALESCE(ct.client_id, p.client_id) AS client_id
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN contracts ct ON ct.id = i.contract_id
      LEFT JOIN clients cl_ct ON cl_ct.id = ct.client_id
      LEFT JOIN clients cl_p ON cl_p.id = p.client_id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      params.push(status);
      q += ` AND i.status = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      q += ` AND i.project_id = $${params.length}`;
    }
    if (client_id) {
      params.push(client_id);
      q += ` AND COALESCE(ct.client_id, p.client_id) = $${params.length}`;
    }
    q += ' ORDER BY i.issued_date DESC';
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const [inv, items] = await Promise.all([
      db.query(
        `
        SELECT i.*, p.name AS project_name, c.name AS client_name, c.contact_email AS client_email, c.address AS client_address
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        LEFT JOIN contracts ct ON ct.id = i.contract_id
        LEFT JOIN clients c ON c.id = ct.client_id
        WHERE i.id = $1
      `,
        [req.params.id]
      ),
      db.query(
        `
        SELECT ii.*, tm.name AS member_name, tm.role AS member_role
        FROM invoice_items ii
        JOIN team_members tm ON tm.id = ii.team_member_id
        WHERE ii.invoice_id = $1
      `,
        [req.params.id]
      ),
    ]);
    if (!inv.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ ...inv.rows[0], items: items.rows });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const {
      project_id,
      contract_id,
      invoice_number,
      amount,
      currency,
      issued_date,
      due_date,
      status,
      notes,
      items,
    } = req.body;
    if (!invoice_number || !amount || !issued_date)
      return res.status(400).json({ error: 'invoice_number, amount, issued_date are required' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        INSERT INTO invoices (project_id, contract_id, invoice_number, amount, currency, issued_date, due_date, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
      `,
        [
          project_id,
          contract_id,
          invoice_number,
          amount,
          currency || 'USD',
          issued_date,
          due_date,
          status || 'draft',
          notes,
        ]
      );

      const invoice = rows[0];
      if (items?.length) {
        for (const item of items) {
          await client.query(
            `
            INSERT INTO invoice_items (invoice_id, team_member_id, task_id, description, hours, rate, amount)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
            [
              invoice.id,
              item.team_member_id,
              item.task_id,
              item.description,
              item.hours,
              item.rate,
              item.amount,
            ]
          );
        }
      }
      await client.query('COMMIT');
      res.status(201).json(invoice);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

// Auto-generate invoice from project allocations
router.post('/generate', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { project_id, contract_id, issued_date, due_date } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const { rows: allocs } = await db.query(
      `
      SELECT ta.*, tm.name AS member_name, tm.hourly_rate,
        t.name AS task_name
      FROM time_allocations ta
      JOIN team_members tm ON tm.id = ta.team_member_id
      JOIN tasks t ON t.id = ta.task_id
      WHERE t.project_id = $1
    `,
      [project_id]
    );

    const items = allocs.map((a) => ({
      team_member_id: a.team_member_id,
      task_id: a.task_id,
      description: `${a.member_name} — ${a.task_name}`,
      hours: parseFloat(a.allocated_hours),
      rate: parseFloat(a.hourly_rate),
      amount: parseFloat(a.allocated_hours) * parseFloat(a.hourly_rate),
    }));

    const total = items.reduce((s, i) => s + i.amount, 0);
    const inv_num = `INV-${Date.now()}`;

    res.json({
      preview: {
        invoice_number: inv_num,
        project_id,
        contract_id,
        amount: total,
        items,
        issued_date,
        due_date,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { amount, currency, issued_date, due_date, status, notes } = req.body;
    const { rows } = await db.query(
      `
      UPDATE invoices SET amount=$1, currency=$2, issued_date=$3, due_date=$4, status=$5, notes=$6
      WHERE id=$7 RETURNING *
    `,
      [amount, currency, issued_date, due_date, status, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await req.app.locals.db.query('DELETE FROM invoices WHERE id=$1', [
      req.params.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Invoice not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// Export PDF
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const [inv, items, proj, client] = await Promise.all([
      db.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]),
      db.query(
        `
        SELECT ii.*, tm.name AS member_name FROM invoice_items ii
        JOIN team_members tm ON tm.id = ii.team_member_id WHERE ii.invoice_id = $1
      `,
        [req.params.id]
      ),
      db.query('SELECT * FROM projects WHERE id=(SELECT project_id FROM invoices WHERE id=$1)', [
        req.params.id,
      ]),
      db.query(
        `
        SELECT c.* FROM clients c
        JOIN contracts ct ON ct.client_id = c.id
        WHERE ct.id = (SELECT contract_id FROM invoices WHERE id=$1)
        LIMIT 1
      `,
        [req.params.id]
      ),
    ]);
    if (!inv.rows.length) return res.status(404).json({ error: 'Invoice not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${inv.rows[0].invoice_number}.pdf"`
    );
    generateInvoicePDF(inv.rows[0], items.rows, proj.rows[0], client.rows[0], res);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
