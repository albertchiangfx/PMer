/**
 * 合約 / 發票狀態：簡化為 4 階段，並包含舊值兼容對應。
 *
 * 合約：unsent（未送出/草稿）→ sent（已送出，等對方簽）→ signed（已回簽）；cancelled 為作廢
 * 發票：unissued（未開立）→ issued（已開立，等收款）→ paid（已收款）；cancelled 為作廢
 */

export const CONTRACT_STATUSES = ['unsent', 'sent', 'signed', 'cancelled'];
export const CONTRACT_STATUS_LABEL = {
  unsent: '未送出',
  sent: '已送出',
  signed: '已回簽',
  cancelled: '作廢',
};

export const INVOICE_STATUSES = ['unissued', 'issued', 'paid', 'cancelled'];
export const INVOICE_STATUS_LABEL = {
  unissued: '未開立',
  issued: '已開立',
  paid: '已收款',
  cancelled: '作廢',
};

export function normalizeContractStatus(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'unsent' || v === 'draft' || v === '') return 'unsent';
  if (v === 'sent') return 'sent';
  if (v === 'signed') return 'signed';
  if (v === 'cancelled' || v === 'expired' || v === 'void') return 'cancelled';
  return 'unsent';
}

export function normalizeInvoiceStatus(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'unissued' || v === 'draft' || v === '') return 'unissued';
  if (v === 'issued' || v === 'sent' || v === 'overdue') return 'issued';
  if (v === 'paid') return 'paid';
  if (v === 'cancelled' || v === 'void') return 'cancelled';
  return 'unissued';
}

export function contractStatusLabel(raw) {
  return CONTRACT_STATUS_LABEL[normalizeContractStatus(raw)];
}

export function invoiceStatusLabel(raw) {
  return INVOICE_STATUS_LABEL[normalizeInvoiceStatus(raw)];
}

export function contractNeedsAttention(raw) {
  const v = normalizeContractStatus(raw);
  return v === 'unsent' || v === 'sent';
}

export function invoiceNeedsAttention(raw) {
  const v = normalizeInvoiceStatus(raw);
  return v === 'unissued' || v === 'issued';
}

const _CONTRACT_BADGE = {
  unsent: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  sent: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  signed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
};

const _INVOICE_BADGE = {
  unissued: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  issued: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
};

export function contractBadgeStyle(raw) {
  return _CONTRACT_BADGE[normalizeContractStatus(raw)];
}

export function invoiceBadgeStyle(raw) {
  return _INVOICE_BADGE[normalizeInvoiceStatus(raw)];
}
