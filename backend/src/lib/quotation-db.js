/** 報價單 DB 讀取（內部 / 公開 API 共用） */

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

async function loadQuotationWithItemsByPublicToken(db, token) {
  const { rows } = await db.query(
    `SELECT id FROM quotations WHERE public_token = $1 AND client_visible = TRUE`,
    [token]
  );
  if (!rows.length) return null;
  return loadQuotationWithItems(db, rows[0].id);
}

function buildQuotationRenderContext(row) {
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

module.exports = {
  loadQuotationWithItems,
  loadQuotationWithItemsByPublicToken,
  buildQuotationRenderContext,
};
