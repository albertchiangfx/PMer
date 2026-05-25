'use client';

import { useEffect, useState } from 'react';
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  normalizeInvoiceStatus,
} from '../lib/financial-status';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso, days) {
  if (!baseIso) return '';
  const d = new Date(baseIso);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDay(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function defaultForm(initial, defaults = {}) {
  const issued =
    isoDay(initial?.issued_date) || isoDay(defaults.issued_date) || todayIso();
  return {
    project_id: initial?.project_id || defaults.project_id || '',
    contract_id: initial?.contract_id || defaults.contract_id || '',
    invoice_number: initial?.invoice_number || `INV-${Date.now()}`,
    amount: initial?.amount ?? '',
    currency: initial?.currency || defaults.currency || 'TWD',
    issued_date: issued,
    due_date:
      isoDay(initial?.due_date) || isoDay(defaults.due_date) || addDaysIso(issued, 30),
    status: normalizeInvoiceStatus(initial?.status || defaults.status || 'unissued'),
    notes: initial?.notes || '',
  };
}

export default function InvoiceFormModal({
  open,
  mode = 'create',
  initial = null,
  defaults = {},
  projects = [],
  contracts = [],
  lockProject = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => defaultForm(initial, defaults));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm(initial, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    initial,
    defaults.project_id,
    defaults.contract_id,
    defaults.currency,
    defaults.issued_date,
    defaults.due_date,
  ]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.invoice_number || !form.issued_date) {
      alert('請填寫發票號碼與開立日期');
      return;
    }
    if (form.amount === '' || form.amount == null) {
      alert('請填寫金額');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        ...form,
        amount: parseFloat(form.amount) || 0,
        status: normalizeInvoiceStatus(form.status),
      });
      onClose?.();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const projectContracts = form.project_id
    ? contracts.filter((c) => String(c.project_id) === String(form.project_id))
    : contracts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? '新增發票' : '編輯發票'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <L>發票號碼 *</L>
              <input
                value={form.invoice_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoice_number: e.target.value }))
                }
                required
                className={inp}
              />
            </div>
            <div>
              <L>狀態</L>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={inp}
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INVOICE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>關聯專案</L>
              <select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                disabled={lockProject}
                className={inp}
              >
                <option value="">請選擇</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>關聯合約</L>
              <select
                value={form.contract_id}
                onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
                className={inp}
              >
                <option value="">無</option>
                {projectContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_number || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>開立日 *</L>
              <input
                type="date"
                value={form.issued_date}
                onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))}
                required
                className={inp}
              />
            </div>
            <div>
              <L>到期日</L>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className={inp}
              />
            </div>
            <div>
              <L>金額 *</L>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
                placeholder="0.00"
                className={inp}
              />
            </div>
            <div>
              <L>幣別</L>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className={inp}
              >
                {['TWD', 'USD', 'EUR', 'JPY', 'CNY'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <L>備註</L>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-apple"
            >
              {mode === 'create' ? '建立發票' : '儲存'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 text-sm text-gray-500"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inp =
  'w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-500';

function L({ children }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>;
}
