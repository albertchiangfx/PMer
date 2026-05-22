'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { fmt, fmtCurrency, statusStyle } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';
import {
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollClass,
} from '../../lib/page-layout';

const STATUS_OPTS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [items, setItems] = useState([]);
  const [genModal, setGenModal] = useState(false);
  const [genProjectId, setGenProjectId] = useState('');
  const [preview, setPreview] = useState(null);

  function defaultForm() {
    return {
      project_id: '',
      contract_id: '',
      invoice_number: `INV-${Date.now()}`,
      amount: '',
      currency: 'USD',
      issued_date: new Date().toISOString().split('T')[0],
      due_date: '',
      status: 'draft',
      notes: '',
    };
  }

  const load = useCallback(async () => {
    const [i, p, c, m] = await Promise.all([
      api.getInvoices(),
      api.getProjects(),
      api.getContracts(),
      api.getTeamMembers(),
    ]);
    setInvoices(i);
    setProjects(p);
    setContracts(c);
    setMembers(m);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const data = { ...form, amount: parseFloat(form.amount), items };
    if (modal === 'create') await api.createInvoice(data);
    else await api.updateInvoice(modal.id, data);
    setModal(null);
    load();
  };

  const del = async (inv) => {
    if (!confirm(`刪除發票「${inv.invoice_number}」？`)) return;
    await api.deleteInvoice(inv.id);
    load();
  };

  const generatePreview = async () => {
    if (!genProjectId) return;
    const result = await api.generateInvoicePreview({ project_id: genProjectId });
    setPreview(result.preview);
  };

  const confirmGenerate = async () => {
    if (!preview) return;
    await api.createInvoice({ ...preview, status: 'draft' });
    setGenModal(false);
    setPreview(null);
    load();
  };

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { team_member_id: '', task_id: '', description: '', hours: 8, rate: 0, amount: 0 },
    ]);
  const updateItem = (i, field, val) =>
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      if (field === 'hours' || field === 'rate') {
        const h = field === 'hours' ? parseFloat(val) : parseFloat(next[i].hours);
        const r = field === 'rate' ? parseFloat(val) : parseFloat(next[i].rate);
        next[i].amount = h * r;
      }
      return next;
    });

  const summary = {
    total: invoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0),
    paid: invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + parseFloat(i.amount || 0), 0),
    pending: invoices
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + parseFloat(i.amount || 0), 0),
  };

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
      <BackToDashboard className="mb-2 md:mb-4" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">發票管理</h1>
          <p className="text-gray-400 mt-1 text-sm">{invoices.length} 份發票</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setGenModal(true)}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
          >
            自動計費
          </button>
          <button
            onClick={() => {
              setForm(defaultForm());
              setItems([]);
              setModal('create');
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
          >
            + 新增發票
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-apple-lg shadow-apple p-5">
          <p className="text-xs text-gray-400">發票總額</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtCurrency(summary.total)}</p>
        </div>
        <div className="bg-white rounded-apple-lg shadow-apple p-5">
          <p className="text-xs text-gray-400">已付款</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmtCurrency(summary.paid)}</p>
        </div>
        <div className="bg-white rounded-apple-lg shadow-apple p-5">
          <p className="text-xs text-gray-400">待收款</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{fmtCurrency(summary.pending)}</p>
        </div>
      </div>
      </div>

      <div className={pageFrameScrollClass}>
      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-apple-xl shadow-apple overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['發票號碼', '專案', '開立日', '到期日', '金額', '狀態', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map((inv) => {
                const s = statusStyle(inv.status);
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-700 font-medium">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{inv.project_name || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{fmt(inv.issued_date)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{fmt(inv.due_date)}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">
                      {fmtCurrency(inv.amount, inv.currency)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setForm({
                              project_id: inv.project_id || '',
                              contract_id: inv.contract_id || '',
                              invoice_number: inv.invoice_number,
                              amount: inv.amount,
                              currency: inv.currency,
                              issued_date: inv.issued_date?.split('T')[0] || '',
                              due_date: inv.due_date?.split('T')[0] || '',
                              status: inv.status,
                              notes: inv.notes || '',
                            });
                            setItems([]);
                            setModal(inv);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          編輯
                        </button>
                        <a
                          href={api.downloadInvoicePDF(inv.id)}
                          target="_blank"
                          className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                        >
                          PDF
                        </a>
                        <button
                          onClick={() => del(inv)}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <div className="py-16 text-center text-gray-400 text-sm">尚無發票</div>
          )}
        </div>
      )}
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold">
                {modal === 'create' ? '新增發票' : '編輯發票'}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>
            <form onSubmit={save} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <L>發票號碼 *</L>
                  <I
                    value={form.invoice_number}
                    onChange={(v) => setForm((f) => ({ ...f, invoice_number: v }))}
                    required
                  />
                </div>
                <div>
                  <L>狀態</L>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className={inp}
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <L>關聯專案</L>
                  <select
                    value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
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
                    <option value="">請選擇</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <L>開立日期 *</L>
                  <I
                    type="date"
                    value={form.issued_date}
                    onChange={(v) => setForm((f) => ({ ...f, issued_date: v }))}
                    required
                  />
                </div>
                <div>
                  <L>到期日</L>
                  <I
                    type="date"
                    value={form.due_date}
                    onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
                  />
                </div>
                <div>
                  <L>金額 *</L>
                  <I
                    type="number"
                    value={form.amount}
                    onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                    required
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <L>幣別</L>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className={inp}
                  >
                    {['USD', 'TWD', 'EUR', 'JPY'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">發票明細</h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + 新增明細
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-6 gap-2 bg-gray-50 rounded-apple p-3">
                      <div className="col-span-2">
                        <select
                          value={item.team_member_id}
                          onChange={(e) => updateItem(i, 'team_member_id', e.target.value)}
                          className={`${inp} text-xs`}
                        >
                          <option value="">選擇成員</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        placeholder="描述"
                        value={item.description}
                        onChange={(e) => updateItem(i, 'description', e.target.value)}
                        className={`${inp} col-span-2 text-xs`}
                      />
                      <input
                        type="number"
                        placeholder="時數"
                        value={item.hours}
                        onChange={(e) => updateItem(i, 'hours', e.target.value)}
                        className={`${inp} text-xs`}
                      />
                      <input
                        type="number"
                        placeholder="時薪"
                        value={item.rate}
                        onChange={(e) => updateItem(i, 'rate', e.target.value)}
                        className={`${inp} text-xs`}
                      />
                    </div>
                  ))}
                </div>
                {items.length > 0 && (
                  <div className="text-right mt-2 text-sm font-semibold text-gray-900">
                    明細合計：
                    {fmtCurrency(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}
                  </div>
                )}
              </div>

              <div>
                <L>備註</L>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple"
                >
                  {modal === 'create' ? '建立發票' : '儲存'}
                </button>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 text-sm text-gray-500"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-generate Modal */}
      {genModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setGenModal(false)}
        >
          <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold">自動計費</h2>
              <button
                onClick={() => setGenModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">
                選擇專案，系統將依據成員分配的工時 × 時薪自動計算發票金額。
              </p>
              <L>選擇專案</L>
              <select
                value={genProjectId}
                onChange={(e) => setGenProjectId(e.target.value)}
                className={inp}
              >
                <option value="">請選擇</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={generatePreview}
                className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-apple transition-colors"
              >
                預覽計費
              </button>
              {preview && (
                <div className="mt-4 bg-indigo-50 rounded-apple p-4">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">計費預覽</p>
                  <div className="space-y-1">
                    {preview.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-indigo-800">
                        <span>{item.description}</span>
                        <span>
                          {item.hours}h × ${item.rate} = {fmtCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-indigo-200 mt-3 pt-3 flex justify-between text-sm font-bold text-indigo-900">
                    <span>總計</span>
                    <span>{fmtCurrency(preview.amount)}</span>
                  </div>
                  <button
                    onClick={confirmGenerate}
                    className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple transition-colors"
                  >
                    建立發票
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp =
  'w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
function L({ children }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>;
}
function I({ type = 'text', value, onChange, required, placeholder }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className={inp}
    />
  );
}
function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
