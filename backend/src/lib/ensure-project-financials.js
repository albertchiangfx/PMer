/**
 * 每個專案至少一筆草稿合約（需有客戶）與草稿發票，供合約／發票管理頁直接編輯。
 */
const { ymdFromDb } = require('./projectDateBounds');

function todayYmd() {
  return ymdFromDb(new Date());
}

function draftContractNumber(projectId) {
  return `DRAFT-${String(projectId).replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function draftInvoiceNumber(projectId) {
  return `DRAFT-INV-${String(projectId).replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

async function ensureProjectFinancialPlaceholders(db, project) {
  if (!project?.id) return;

  const project_id = project.id;
  const client_id = project.client_id || null;
  const issued = ymdFromDb(project.start_date) || todayYmd();

  let contractId = null;
  const { rows: existingContracts } = await db.query(
    'SELECT id FROM contracts WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1',
    [project_id]
  );
  if (existingContracts.length) {
    contractId = existingContracts[0].id;
  } else if (client_id) {
    try {
      const { rows } = await db.query(
        `INSERT INTO contracts (
          project_id, client_id, contract_number, amount, currency, status, notes
        ) VALUES ($1,$2,$3,0,'TWD','unsent',$4)
        RETURNING id`,
        [
          project_id,
          client_id,
          draftContractNumber(project_id),
          '待填寫：專案建立時自動產生的合約草稿，請補齊金額與日期。',
        ]
      );
      contractId = rows[0]?.id || null;
    } catch (e) {
      if (e.code !== '23505') throw e;
      const { rows } = await db.query(
        'SELECT id FROM contracts WHERE project_id = $1 LIMIT 1',
        [project_id]
      );
      contractId = rows[0]?.id || null;
    }
  }

  const { rows: existingInvoices } = await db.query(
    'SELECT id FROM invoices WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1',
    [project_id]
  );
  if (!existingInvoices.length) {
    try {
      await db.query(
        `INSERT INTO invoices (
          project_id, contract_id, invoice_number, amount, currency, issued_date, status, notes
        ) VALUES ($1,$2,$3,0,'TWD',$4,'unissued',$5)`,
        [
          project_id,
          contractId,
          draftInvoiceNumber(project_id),
          issued,
          '待填寫：專案建立時自動產生的發票草稿，請補齊金額與品項。',
        ]
      );
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
}

async function ensureAllProjectsFinancialPlaceholders(db) {
  const { rows } = await db.query('SELECT * FROM projects');
  for (const p of rows) {
    try {
      await ensureProjectFinancialPlaceholders(db, p);
    } catch (e) {
      console.error('[ensure-project-financials]', p.id, e.message);
    }
  }
}

let backfillOncePromise = null;

/** 首次載入合約／發票列表時，為既有專案補齊草稿（冪等）。 */
function ensureBackfillOnce(db) {
  if (!backfillOncePromise) {
    backfillOncePromise = ensureAllProjectsFinancialPlaceholders(db).catch((e) => {
      backfillOncePromise = null;
      throw e;
    });
  }
  return backfillOncePromise;
}

module.exports = {
  ensureProjectFinancialPlaceholders,
  ensureAllProjectsFinancialPlaceholders,
  ensureBackfillOnce,
};
