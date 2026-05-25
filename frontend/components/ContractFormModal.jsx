'use client';

import { useEffect, useState } from 'react';
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABEL,
  normalizeContractStatus,
} from '../lib/financial-status';

function isoDay(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function defaultForm(initial, defaults = {}) {
  return {
    project_id: initial?.project_id || defaults.project_id || '',
    client_id: initial?.client_id || defaults.client_id || '',
    contract_number: initial?.contract_number || '',
    amount: initial?.amount ?? '',
    currency: initial?.currency || defaults.currency || 'TWD',
    signed_date: isoDay(initial?.signed_date) || isoDay(defaults.signed_date),
    effective_date: isoDay(initial?.effective_date) || isoDay(defaults.effective_date),
    expiry_date: isoDay(initial?.expiry_date) || isoDay(defaults.expiry_date),
    status: normalizeContractStatus(initial?.status || defaults.status || 'unsent'),
    notes: initial?.notes || '',
  };
}

export default function ContractFormModal({
  open,
  mode = 'create',
  initial = null,
  defaults = {},
  projects = [],
  clients = [],
  lockProject = false,
  lockClient = false,
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
    defaults.client_id,
    defaults.effective_date,
    defaults.expiry_date,
    defaults.currency,
  ]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.project_id || !form.client_id) {
      alert('請選擇專案與客戶');
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
        status: normalizeContractStatus(form.status),
      });
      onClose?.();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? '新增合約' : '編輯合約'}
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
              <L>專案 *</L>
              <select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                required
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
              <L>客戶 *</L>
              <select
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                required
                disabled={lockClient}
                className={inp}
              >
                <option value="">請選擇</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>合約編號</L>
              <input
                value={form.contract_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contract_number: e.target.value }))
                }
                placeholder="留空自動產生"
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
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CONTRACT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
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
            <div>
              <L>簽署日</L>
              <input
                type="date"
                value={form.signed_date}
                onChange={(e) => setForm((f) => ({ ...f, signed_date: e.target.value }))}
                className={inp}
              />
            </div>
            <div>
              <L>生效日</L>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, effective_date: e.target.value }))
                }
                className={inp}
              />
            </div>
            <div className="col-span-2">
              <L>到期日</L>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                className={inp}
              />
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
              {mode === 'create' ? '建立合約' : '儲存'}
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
