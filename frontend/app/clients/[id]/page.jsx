'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { buildClientFinancialRows } from '../../../lib/client-financial';
import { fmt, fmtCurrency, statusStyle } from '../../../lib/utils';
import BackToDashboard from '../../../components/BackToDashboard';
import {
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollClass,
  cardClass,
  surfaceSectionClass,
  surfacePadClass,
} from '../../../lib/page-layout';

const PROJECT_FILTER = [
  ['all', '全部'],
  ['active', '進行中'],
  ['done', '已結案'],
];

const FIN_FILTER = [
  ['pending', '待處理'],
  ['all', '全部紀錄'],
];

const ACTIVE = new Set(['planning', 'active', 'wrapping']);
const DONE = new Set(['completed', 'cancelled', 'paused']);

function defaultClientForm(c) {
  return {
    name: c?.name || '',
    contact_email: c?.contact_email || '',
    contact_phone: c?.contact_phone || '',
    address: c?.address || '',
  };
}

function finStatusZh(kind, status) {
  if (kind === 'missing_contract') return '待簽約';
  if (kind === 'contract') {
    if (status === 'signed') return '已簽署';
    if (status === 'draft') return '草稿';
    if (status === 'sent') return '已送出';
    return status || '—';
  }
  const map = { draft: '草稿', sent: '已寄出', paid: '已收款', overdue: '逾期', cancelled: '取消' };
  return map[status] || status || '—';
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(defaultClientForm());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');
  const [finFilter, setFinFilter] = useState('pending');
  const [projectModal, setProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');

  const load = useCallback(async () => {
    const [c, p, ct, inv] = await Promise.all([
      api.getClient(id),
      api.getProjects({ client_id: id }),
      api.getContracts({ client_id: id }),
      api.getInvoices({ client_id: id }),
    ]);
    setClient(c);
    setForm(defaultClientForm(c));
    setProjects(Array.isArray(p) ? p : []);
    setContracts(Array.isArray(ct) ? ct : []);
    setInvoices(Array.isArray(inv) ? inv : []);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    load()
      .catch((e) => {
        alert(e.message || String(e));
        router.push('/clients');
      })
      .finally(() => setLoading(false));
  }, [id, load, router]);

  const filteredProjects = useMemo(() => {
    if (projectFilter === 'active') return projects.filter((p) => ACTIVE.has(p.status));
    if (projectFilter === 'done') return projects.filter((p) => DONE.has(p.status));
    return projects;
  }, [projects, projectFilter]);

  const financialRows = useMemo(
    () => buildClientFinancialRows(projects, contracts, invoices),
    [projects, contracts, invoices]
  );

  const filteredFinancial = useMemo(() => {
    if (finFilter === 'all') return financialRows;
    return financialRows.filter((r) => r.pending);
  }, [financialRows, finFilter]);

  const saveClient = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('請填寫客戶名稱');
      return;
    }
    try {
      setSaving(true);
      const updated = await api.updateClient(id, form);
      setClient(updated);
      setForm(defaultClientForm(updated));
      setEditing(false);
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const delClient = async () => {
    if (!confirm(`刪除客戶「${client?.name}」？\n專案將改為無客戶；若有合約綁定將無法刪除。`)) return;
    try {
      await api.deleteClient(id);
      router.push('/clients');
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim()) {
      alert('請填寫專案名稱');
      return;
    }
    try {
      setSaving(true);
      const p = await api.createProject({
        name: projectName.trim(),
        client_id: id,
        status: 'planning',
      });
      setProjectModal(false);
      setProjectName('');
      router.push(`/projects/${p.id}`);
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={pageFrameClass}>
        <div className="py-16 text-center text-sm text-slate-500">載入中…</div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
      <BackToDashboard className="mb-2 md:mb-4" />

      <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
        <Link href="/clients" className="hover:text-gray-600">
          客戶
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium truncate">{client.name}</span>
      </div>

      <div className={`${cardClass} mb-3 md:mb-4`}>
        {editing ? (
          <form onSubmit={saveClient} className="space-y-3">
            <h1 className="text-lg font-bold text-slate-900">編輯客戶</h1>
            <Field label="名稱 *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field label="Email" value={form.contact_email} onChange={(v) => setForm((f) => ({ ...f, contact_email: v }))} />
            <Field label="電話" value={form.contact_phone} onChange={(v) => setForm((f) => ({ ...f, contact_phone: v }))} />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">地址</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={2}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-xl">
                儲存
              </button>
              <button type="button" onClick={() => { setEditing(false); setForm(defaultClientForm(client)); }} className="text-sm text-gray-500 px-3">
                取消
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900">{client.name}</h1>
                {client.contact_email ? <p className="text-sm text-slate-600 mt-1">{client.contact_email}</p> : null}
                {client.contact_phone ? <p className="text-sm text-slate-500">{client.contact_phone}</p> : null}
                {client.address ? <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{client.address}</p> : null}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-indigo-600">
                  編輯
                </button>
                <button type="button" onClick={delClient} className="text-xs font-semibold text-rose-600">
                  刪除
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      <div className={pageFrameScrollClass}>
      <section className={`${surfaceSectionClass} ${surfacePadClass} mb-3 md:mb-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-slate-900">合約與收款</h2>
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
            {FIN_FILTER.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFinFilter(k)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  finFilter === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          待處理：進行中專案尚未簽約、合約未簽署、發票未收款。
        </p>
        {filteredFinancial.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {finFilter === 'pending' ? '目前沒有待簽約或未收款項目' : '尚無合約或發票紀錄'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredFinancial.map((row) => (
              <li key={`${row.kind}-${row.id}`} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    <span
                      className={`inline-block mr-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        row.kind === 'invoice'
                          ? 'bg-violet-100 text-violet-800'
                          : row.kind === 'contract'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {row.kind === 'invoice' ? '收款' : row.kind === 'contract' ? '合約' : '待簽'}
                    </span>
                    {row.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {row.project_name}
                    {row.date ? ` · ${String(row.date).slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {row.amount != null ? (
                    <p className="text-sm font-semibold tabular-nums">{fmtCurrency(row.amount, row.currency || 'USD')}</p>
                  ) : null}
                  <p
                    className={`text-[10px] font-semibold mt-0.5 ${
                      row.pending ? 'text-amber-700' : 'text-emerald-600'
                    }`}
                  >
                    {finStatusZh(row.kind, row.status)}
                  </p>
                  {row.project_id ? (
                    <Link href={`/projects/${row.project_id}`} className="text-[10px] text-indigo-600 font-medium">
                      專案
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-3 text-xs">
          <Link href="/contracts" className="text-indigo-600 font-semibold">
            合約管理 →
          </Link>
          <Link href="/invoices" className="text-indigo-600 font-semibold">
            發票管理 →
          </Link>
        </div>
      </section>

      {/* 專案歷史 */}
      <section className={`${surfaceSectionClass} ${surfacePadClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-slate-900">專案歷史</h2>
          <button
            type="button"
            onClick={() => setProjectModal(true)}
            className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg"
          >
            ＋ 新專案
          </button>
        </div>
        <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg mb-3 w-fit">
          {PROJECT_FILTER.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setProjectFilter(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                projectFilter === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {filteredProjects.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">尚無專案</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredProjects.map((p) => {
              const st = statusStyle(p.status);
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50/80 -mx-1 px-1 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {p.start_date ? fmt(p.start_date, 'yyyy/MM/dd') : '—'}
                        {p.end_date ? ` — ${fmt(p.end_date, 'yyyy/MM/dd')}` : ''}
                        {p.budget != null ? ` · ${fmtCurrency(p.budget)}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                      {p.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      {projectModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setProjectModal(false)}
        >
          <form
            onSubmit={createProject}
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-slate-900">為此客戶建立專案</h3>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="專案名稱"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-xl">
                建立
              </button>
              <button type="button" onClick={() => setProjectModal(false)} className="text-sm text-gray-500 px-3">
                取消
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />
    </div>
  );
}
