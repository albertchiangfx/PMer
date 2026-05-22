/** 合約／收款紀錄列（客戶詳情用） */

const OPEN_CONTRACT = new Set(['draft', 'sent']);
const OPEN_INVOICE = new Set(['draft', 'sent', 'overdue']);
const ACTIVE_PROJECT = new Set(['planning', 'active', 'wrapping']);

export function contractNeedsAttention(status) {
  return status !== 'signed' && status !== 'cancelled';
}

export function invoiceNeedsAttention(status) {
  return OPEN_INVOICE.has(String(status || '').toLowerCase());
}

/**
 * @param {object[]} projects
 * @param {object[]} contracts
 * @param {object[]} invoices
 */
export function buildClientFinancialRows(projects, contracts, invoices) {
  const rows = [];

  for (const c of contracts || []) {
    rows.push({
      kind: 'contract',
      id: c.id,
      project_id: c.project_id,
      project_name: c.project_name || '—',
      label: c.contract_number ? `合約 ${c.contract_number}` : '合約',
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      date: c.signed_date || c.effective_date || c.created_at,
      pending: contractNeedsAttention(c.status),
    });
  }

  for (const inv of invoices || []) {
    rows.push({
      kind: 'invoice',
      id: inv.id,
      project_id: inv.project_id,
      project_name: inv.project_name || '—',
      label: inv.invoice_number ? `發票 ${inv.invoice_number}` : '發票',
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      date: inv.issued_date || inv.due_date || inv.created_at,
      pending: invoiceNeedsAttention(inv.status),
    });
  }

  const contractByProject = new Map();
  for (const c of contracts || []) {
    if (!contractByProject.has(c.project_id)) contractByProject.set(c.project_id, []);
    contractByProject.get(c.project_id).push(c);
  }

  for (const p of projects || []) {
    if (!ACTIVE_PROJECT.has(String(p.status || '').toLowerCase())) continue;
    const list = contractByProject.get(p.id) || [];
    const hasSigned = list.some((c) => c.status === 'signed');
    if (list.length === 0 || !hasSigned) {
      rows.push({
        kind: 'missing_contract',
        id: `missing-${p.id}`,
        project_id: p.id,
        project_name: p.name,
        label: list.length === 0 ? '尚無合約' : '合約未簽署',
        amount: null,
        currency: null,
        status: list[0]?.status || '—',
        date: p.start_date || p.created_at,
        pending: true,
      });
    }
  }

  rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return rows;
}

export function summarizeClientAlerts(projects, contracts, invoices) {
  const rows = buildClientFinancialRows(projects, contracts, invoices);
  const pending = rows.filter((r) => r.pending);
  const unsigned = pending.filter(
    (r) => r.kind === 'missing_contract' || (r.kind === 'contract' && contractNeedsAttention(r.status))
  );
  const unpaid = pending.filter((r) => r.kind === 'invoice');
  return { pendingCount: pending.length, unsignedCount: unsigned.length, unpaidCount: unpaid.length };
}
