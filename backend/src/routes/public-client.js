/**
 * 客戶公開 API（僅 token，無登入）
 *   GET  /hub/:token
 *   GET  /quotations/:token
 *   POST /quotations/:token/view
 *   POST /quotations/:token/accept
 *   POST /quotations/:token/reject
 */
const express = require('express');
const router = express.Router();
const studio = require('../contract-generator/studio-config');
const { renderQuotation } = require('../quote-generator/render');
const {
  loadQuotationWithItemsByPublicToken,
  buildQuotationRenderContext,
} = require('../lib/quotation-db');

const PROJECT_STATUS_PUBLIC = {
  planning: '籌備中',
  active: '製作中',
  wrapping: '收尾中',
  completed: '已完成',
  paused: '暫停',
  cancelled: '已取消',
};

const QUOTE_STATUS_PUBLIC = {
  sent: '待確認',
  viewed: '已查看',
  accepted: '已接受',
  rejected: '已婉拒',
  expired: '已過期',
};

function sanitizeMilestones(rows) {
  return (rows || []).map((m) => ({
    label: m.label,
    completed: !!m.completed,
    timeline_end_date: m.timeline_end_date,
  }));
}

function nextMilestoneHint(milestones) {
  const pending = (milestones || []).filter((m) => !m.completed);
  if (!pending.length) return null;
  const withDate = pending.filter((m) => m.timeline_end_date);
  if (withDate.length) {
    withDate.sort((a, b) => String(a.timeline_end_date).localeCompare(String(b.timeline_end_date)));
    return { label: withDate[0].label, date: withDate[0].timeline_end_date };
  }
  return { label: pending[0].label, date: null };
}

async function loadHubByToken(db, token) {
  const { rows } = await db.query(
    `SELECT h.*, p.name AS project_name, p.status AS project_status,
            p.color AS project_color,
            p.start_date, p.end_date, p.description AS project_description,
            c.name AS client_name
       FROM client_hubs h
       JOIN projects p ON p.id = h.project_id
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE h.public_token = $1 AND h.is_active = TRUE`,
    [token]
  );
  return rows[0] || null;
}

async function touchHubView(db, hubId) {
  await db.query(
    `UPDATE client_hubs SET
       first_viewed_at = COALESCE(first_viewed_at, CURRENT_TIMESTAMP),
       last_viewed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [hubId]
  );
}

router.get('/hub/:token', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const hub = await loadHubByToken(db, req.params.token);
    if (!hub) return res.status(404).json({ error: 'Not found' });

    await touchHubView(db, hub.id);

    const { rows: milestones } = await db.query(
      `SELECT label, completed, timeline_end_date
         FROM project_milestones
        WHERE project_id = $1
        ORDER BY sort_order ASC, created_at ASC`,
      [hub.project_id]
    );
    const sanitized = sanitizeMilestones(milestones);
    const completed = sanitized.filter((m) => m.completed).length;
    const total = sanitized.length;

    const { rows: quotations } = await db.query(
      `SELECT public_token, quote_number, title, status, currency, total,
              valid_until, viewed_at, accepted_at, pdf_path
         FROM quotations
        WHERE project_id = $1 AND client_visible = TRUE AND public_token IS NOT NULL
        ORDER BY created_at DESC`,
      [hub.project_id]
    );

    const { rows: links } = await db.query(
      `SELECT kind, label, url FROM client_hub_links
        WHERE hub_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [hub.id]
    );

    const displayName = hub.studio_display_name || studio.name || 'Studio';

    res.json({
      studio: {
        name: displayName,
        contact_email: studio.contact_email || null,
        contact_phone: studio.contact_phone || null,
      },
      hub: {
        title: hub.title,
        welcome_message: hub.welcome_message,
      },
      project: {
        name: hub.project_name,
        color: hub.project_color || null,
        status: hub.project_status,
        status_label: PROJECT_STATUS_PUBLIC[hub.project_status] || hub.project_status,
        start_date: hub.start_date,
        end_date: hub.end_date,
      },
      client: { name: hub.client_name },
      progress: {
        completed,
        total,
        percent: total ? Math.round((completed / total) * 100) : 0,
        milestones: sanitized,
        next: nextMilestoneHint(sanitized),
      },
      quotations: quotations.map((q) => ({
        public_token: q.public_token,
        quote_number: q.quote_number,
        title: q.title,
        status: q.status,
        status_label: QUOTE_STATUS_PUBLIC[q.status] || q.status,
        currency: q.currency,
        total: q.total,
        valid_until: q.valid_until,
        viewed_at: q.viewed_at,
        pdf_path: q.pdf_path,
        has_pdf: !!q.pdf_path,
      })),
      links,
      coming_soon: {
        contract: true,
        invoice: true,
      },
    });
  } catch (e) {
    next(e);
  }
});

async function loadPublicQuotation(db, token) {
  const { rows } = await db.query(
    `SELECT q.id, q.quote_number, q.title, q.status, q.currency,
            q.issued_date, q.valid_until, q.subtotal, q.tax_rate, q.tax_due, q.total,
            q.notes, q.pdf_path, q.viewed_at, q.accepted_at, q.rejected_at,
            c.name AS client_name
       FROM quotations q
       LEFT JOIN clients c ON c.id = q.client_id
      WHERE q.public_token = $1 AND q.client_visible = TRUE`,
    [token]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const { rows: items } = await db.query(
    `SELECT section_label, name, description, qty, unit_price, line_total, sort_order
       FROM quotation_items WHERE quotation_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
    [row.id]
  );
  return {
    quote_number: row.quote_number,
    title: row.title,
    status: row.status,
    status_label: QUOTE_STATUS_PUBLIC[row.status] || row.status,
    currency: row.currency,
    issued_date: row.issued_date,
    valid_until: row.valid_until,
    subtotal: row.subtotal,
    tax_rate: row.tax_rate,
    tax_due: row.tax_due,
    total: row.total,
    notes: row.notes,
    pdf_path: row.pdf_path,
    viewed_at: row.viewed_at,
    accepted_at: row.accepted_at,
    rejected_at: row.rejected_at,
    client_name: row.client_name,
    items,
    studio: { name: studio.name || 'Studio' },
  };
}

router.get('/quotations/:token/preview-html', async (req, res, next) => {
  try {
    const data = await loadQuotationWithItemsByPublicToken(req.app.locals.db, req.params.token);
    if (!data) return res.status(404).send('Not found');
    let html = renderQuotation(buildQuotationRenderContext(data));
    if (req.query.embed === 'hub') {
      const column = req.query.layout === 'column';
      const embedCss = `
        <style id="hub-embed">
          @media screen {
            html, body { background: transparent !important; overflow: visible !important; height: auto !important; min-height: 0 !important; }
            body { padding: 0 !important; margin: 0 !important; }
            .hdr { margin-bottom: 12pt !important; gap: 12pt !important; }
            ${
              column
                ? `
            body { font-size: 8.5pt !important; }
            .hdr .title { font-size: 14pt !important; letter-spacing: 3pt !important; margin-bottom: 8pt !important; }
            .brand .name { font-size: 11pt !important; }
            .brand .meta { font-size: 7.5pt !important; margin-top: 6pt !important; }
            .meta-table { font-size: 7.5pt !important; }
            .info-row { gap: 12pt !important; margin-bottom: 12pt !important; padding-bottom: 10pt !important; }
            table.items thead th { font-size: 6pt !important; padding: 0 4pt 6pt !important; }
            table.items tbody td { padding: 6pt 4pt !important; font-size: 8.5pt !important; }
            table.items thead th .en { display: none !important; }
            .totals { max-width: 100% !important; width: 100% !important; }
            `
                : ''
            }
          }
        </style>`;
      html = html.includes('</head>')
        ? html.replace('</head>', `${embedCss}</head>`)
        : embedCss + html;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

router.get('/quotations/:token', async (req, res, next) => {
  try {
    const data = await loadPublicQuotation(req.app.locals.db, req.params.token);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post('/quotations/:token/view', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { rows } = await db.query(
      `UPDATE quotations SET
         viewed_at = COALESCE(viewed_at, CURRENT_TIMESTAMP),
         status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END
       WHERE public_token = $1 AND client_visible = TRUE
       RETURNING public_token, status, viewed_at`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/quotations/:token/accept', async (req, res, next) => {
  const db = req.app.locals.db;
  const token = req.params.token;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: targetRows } = await client.query(
      `SELECT id, project_id, status, quote_number
         FROM quotations
        WHERE public_token = $1 AND client_visible = TRUE`,
      [token]
    );
    if (!targetRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const target = targetRows[0];
    if (target.status === 'expired') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '此報價已過期，無法接受' });
    }

    const wasFinal = target.status === 'accepted' || target.status === 'rejected';

    await client.query(
      `UPDATE quotations SET
         status = 'rejected',
         rejected_at = CURRENT_TIMESTAMP,
         accepted_at = NULL
       WHERE project_id = $1
         AND client_visible = TRUE
         AND public_token IS NOT NULL
         AND public_token != $2
         AND status != 'expired'`,
      [target.project_id, token]
    );

    const { rows: acceptedRows } = await client.query(
      `UPDATE quotations SET
         status = 'accepted',
         accepted_at = CURRENT_TIMESTAMP,
         rejected_at = NULL
       WHERE public_token = $1
       RETURNING public_token, status, accepted_at`,
      [token]
    );

    const { rows: all } = await client.query(
      `SELECT public_token, status, quote_number, title
         FROM quotations
        WHERE project_id = $1 AND client_visible = TRUE AND public_token IS NOT NULL
        ORDER BY created_at DESC`,
      [target.project_id]
    );

    await client.query('COMMIT');
    res.json({
      ...acceptedRows[0],
      changed: wasFinal,
      quotations: all,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

router.post('/quotations/:token/reject', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { rows: current } = await db.query(
      `SELECT id, project_id, status FROM quotations
        WHERE public_token = $1 AND client_visible = TRUE`,
      [req.params.token]
    );
    if (!current.length) return res.status(404).json({ error: 'Not found' });

    const row = current[0];
    if (row.status === 'accepted') {
      return res.status(400).json({
        error: '已接受的方案請改選其他方案，或於另一份報價按「接受」以變更選擇',
      });
    }
    if (row.status === 'rejected') {
      const { rows: all } = await db.query(
        `SELECT public_token, status FROM quotations
          WHERE project_id = $1 AND client_visible = TRUE AND public_token IS NOT NULL`,
        [row.project_id]
      );
      return res.json({ public_token: req.params.token, status: 'rejected', quotations: all });
    }
    if (row.status === 'expired') {
      return res.status(400).json({ error: '此報價已過期' });
    }

    const { rows } = await db.query(
      `UPDATE quotations SET
         status = 'rejected',
         rejected_at = CURRENT_TIMESTAMP
       WHERE public_token = $1 AND client_visible = TRUE
       RETURNING public_token, status, rejected_at`,
      [req.params.token]
    );

    const { rows: all } = await db.query(
      `SELECT public_token, status FROM quotations
        WHERE project_id = $1 AND client_visible = TRUE AND public_token IS NOT NULL`,
      [row.project_id]
    );
    res.json({ ...rows[0], quotations: all });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
