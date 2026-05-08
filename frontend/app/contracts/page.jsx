'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { fmt, fmtCurrency, statusStyle } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';

const STATUS_OPTS = ['draft', 'sent', 'signed', 'expired', 'cancelled'];

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [filter, setFilter] = useState('');

  function defaultForm() {
    return { project_id: '', client_id: '', contract_number: '', amount: '', currency: 'USD', signed_date: '', effective_date: '', expiry_date: '', status: 'draft', notes: '' };
  }

  const load = useCallback(async () => {
    const [c, p, cl] = await Promise.all([api.getContracts(), api.getProjects(), api.getClients()]);
    setContracts(c); setProjects(p); setClients(cl);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (modal === 'create') await api.createContract({ ...form, amount: parseFloat(form.amount) });
    else await api.updateContract(modal.id, { ...form, amount: parseFloat(form.amount) });
    setModal(null);
    load();
  };

  const del = async (c) => {
    if (!confirm(`刪除合約「${c.contract_number}」？`)) return;
    await api.deleteContract(c.id);
    load();
  };

  const filtered = contracts.filter(c =>
    !filter || c.contract_number?.toLowerCase().includes(filter.toLowerCase()) ||
    c.project_name?.toLowerCase().includes(filter.toLowerCase()) ||
    c.client_name?.toLowerCase().includes(filter.toLowerCase())
  );

  const summary = {
    total: contracts.reduce((s, c) => s + parseFloat(c.amount || 0), 0),
    signed: contracts.filter(c => c.status === 'signed').length,
    draft: contracts.filter(c => c.status === 'draft').length,
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <BackToDashboard className="mb-4" />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">合約管理</h1>
          <p className="text-gray-400 mt-1 text-sm">{contracts.length} 份合約</p>
        </div>
        <button onClick={() => { setForm(defaultForm()); setModal('create'); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors">
          + 新增合約
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-apple-lg shadow-apple p-5">
          <p className="text-xs text-gray-400">合約總額</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtCurrency(summary.total)}</p>
        </div>
        <div className="bg-white rounded-apple-lg shadow-apple p-5">
          <p className="text-xs text-gray-400">已簽署</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{summary.signed}</p>
        </div>
        <div className="bg-white rounded-apple-lg shadow-apple p-5">
          <p className="text-xs text-gray-400">草稿</p>
          <p className="text-2xl font-bold text-gray-400 mt-1">{summary.draft}</p>
        </div>
      </div>

      <div className="mb-5">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="搜尋合約..."
          className="w-full max-w-sm bg-white border border-gray-200 rounded-apple px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-apple-sm" />
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-apple-xl shadow-apple overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['合約號碼','專案','客戶','金額','簽署日','到期日','狀態',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => {
                const s = statusStyle(c.status);
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-700 font-medium">{c.contract_number}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{c.project_name}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{c.client_name}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{fmtCurrency(c.amount, c.currency)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{fmt(c.signed_date)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{fmt(c.expiry_date)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setForm({ project_id: c.project_id, client_id: c.client_id, contract_number: c.contract_number, amount: c.amount, currency: c.currency, signed_date: c.signed_date || '', effective_date: c.effective_date || '', expiry_date: c.expiry_date || '', status: c.status, notes: c.notes || '' }); setModal(c); }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">編輯</button>
                        <button onClick={() => del(c)} className="text-xs text-red-500 hover:text-red-600 font-medium">刪除</button>
                        {c.file_path && <a href={c.file_path} target="_blank" className="text-xs text-gray-500 hover:text-gray-700 font-medium">檔案</a>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="py-16 text-center text-gray-400 text-sm">尚無合約</div>}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold">{modal === 'create' ? '新增合約' : '編輯合約'}</h2>
              <button onClick={() => setModal(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <L>專案 *</L>
                  <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} required
                    className={inp}>
                    <option value="">請選擇</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <L>客戶 *</L>
                  <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} required
                    className={inp}>
                    <option value="">請選擇</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <L>合約號碼</L>
                  <input value={form.contract_number} onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))} placeholder="自動產生" className={inp} />
                </div>
                <div>
                  <L>狀態</L>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <L>金額 *</L>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="0.00" className={inp} />
                </div>
                <div>
                  <L>幣別</L>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={inp}>
                    {['USD','TWD','EUR','JPY'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><L>簽署日期</L><input type="date" value={form.signed_date} onChange={e => setForm(f => ({ ...f, signed_date: e.target.value }))} className={inp} /></div>
                <div><L>生效日期</L><input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} className={inp} /></div>
                <div className="col-span-2"><L>到期日</L><input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className={inp} /></div>
                <div className="col-span-2">
                  <L>備註</L>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple">
                  {modal === 'create' ? '建立合約' : '儲存'}
                </button>
                <button type="button" onClick={() => setModal(null)} className="px-4 text-sm text-gray-500">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
function L({ children }) { return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>; }
function Spinner() { return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>; }
