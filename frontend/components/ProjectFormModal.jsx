'use client';
import Link from 'next/link';
import { MILESTONE_TEMPLATE_OPTIONS } from '../lib/milestone-templates';

export const PROJECT_STATUS_OPTS = ['planning', 'active', 'completed', 'paused', 'cancelled'];
export const PROJECT_COLOR_OPTS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#14b8a6',
];

export function defaultProjectForm() {
  return {
    name: '',
    client_id: '',
    description: '',
    budget: '',
    status: 'planning',
    start_date: '',
    end_date: '',
    color: '#6366f1',
    milestone_template: '',
  };
}

export function projectToForm(p) {
  return {
    ...defaultProjectForm(),
    ...p,
    budget: p.budget || '',
    client_id: p.client_id || '',
    start_date: p.start_date ? String(p.start_date).slice(0, 10) : '',
    end_date: p.end_date ? String(p.end_date).slice(0, 10) : '',
    milestone_template: '',
  };
}

export function projectFormToPayload(form) {
  return {
    ...form,
    budget: form.budget || null,
    client_id: form.client_id || null,
  };
}

export default function ProjectFormModal({
  title,
  mode = 'edit',
  form,
  setForm,
  clients = [],
  saveBusy,
  onClose,
  onSubmit,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <PfLabel>專案名稱 *</PfLabel>
              <PfInput
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                required
              />
            </div>
            <div>
              <PfLabel>客戶</PfLabel>
              <div className="flex gap-2">
                <select
                  value={form.client_id}
                  onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                  className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">無客戶</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Link
                  href="/clients"
                  className="shrink-0 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-apple hover:bg-indigo-100 transition-colors whitespace-nowrap inline-flex items-center"
                >
                  客戶管理
                </Link>
              </div>
            </div>
            <div>
              <PfLabel>狀態</PfLabel>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PROJECT_STATUS_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <PfLabel>開始日期</PfLabel>
              <PfInput
                type="date"
                value={form.start_date}
                onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
              />
            </div>
            <div>
              <PfLabel>結束日期</PfLabel>
              <PfInput
                type="date"
                value={form.end_date}
                onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
              />
            </div>
            <div>
              <PfLabel>預算</PfLabel>
              <PfInput
                type="number"
                value={form.budget}
                onChange={(v) => setForm((f) => ({ ...f, budget: v }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <PfLabel>顏色</PfLabel>
              <div className="flex gap-2 flex-wrap mt-1">
                {PROJECT_COLOR_OPTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {mode === 'create' && (
              <div className="col-span-2">
                <PfLabel>里程碑公版（選用）</PfLabel>
                <select
                  value={form.milestone_template || ''}
                  onChange={(e) => setForm((f) => ({ ...f, milestone_template: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">建立後自行設定</option>
                  {MILESTONE_TEMPLATE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <PfLabel>描述</PfLabel>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saveBusy}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-apple transition-colors"
            >
              {saveBusy ? '處理中…' : mode === 'create' ? '建立專案' : '儲存變更'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PfLabel({ children }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>;
}

function PfInput({ type = 'text', value, onChange, required, placeholder }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}
