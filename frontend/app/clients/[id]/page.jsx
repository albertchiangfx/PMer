'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { buildClientFinancialRows, projectFinancialWarnings } from '../../../lib/client-financial';
import { filterAndSortProjects } from '../../../lib/project-list-sort';
import { fmt, fmtCurrency, statusStyle } from '../../../lib/utils';
import BackToDashboard from '../../../components/BackToDashboard';
import {
  pageFrameClass,
  pageFrameHeaderClass,
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

function ProjectWarnIcon({ contractWarn, paymentWarn, size = 16 }) {
  const tips = [];
  if (contractWarn) tips.push('合約未簽署或尚無合約');
  if (paymentWarn) tips.push('款項未收齊');
  if (!tips.length) return null;
  return (
    <span
      className="inline-flex shrink-0 text-amber-600"
      title={tips.join('；')}
      aria-label={tips.join('；')}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2L1 21h22L12 2zm0 4.2 6.9 12H5.1L12 6.2zM11 10h2v5h-2v-5zm0 6h2v2h-2v-2z" />
      </svg>
    </span>
  );
}

/** 固定寬度欄，讓各列警告圖垂直對齊 */
function ProjectWarnSlot({ warn }) {
  return (
    <div className="w-5 shrink-0 flex items-center justify-center" aria-hidden={!warn?.hasWarning}>
      {warn?.hasWarning ? (
        <ProjectWarnIcon contractWarn={warn.contractWarn} paymentWarn={warn.paymentWarn} />
      ) : null}
    </div>
  );
}

function projectScheduleBudgetLines(p) {
  const start = p.start_date ? fmt(p.start_date, 'yyyy/MM/dd') : '—';
  const end = p.end_date ? fmt(p.end_date, 'yyyy/MM/dd') : '—';
  const budget = p.budget != null ? fmtCurrency(p.budget) : '—';
  return { start, end, budget };
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
  const [selectedProjectId, setSelectedProjectId] = useState(null);
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

  const sortedProjects = useMemo(
    () => filterAndSortProjects(projects, { sortBy: 'end_date', sortDir: 'desc' }),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    if (projectFilter === 'active') return sortedProjects.filter((p) => ACTIVE.has(p.status));
    if (projectFilter === 'done') return sortedProjects.filter((p) => DONE.has(p.status));
    return sortedProjects;
  }, [sortedProjects, projectFilter]);

  useEffect(() => {
    setSelectedProjectId((prev) => {
      if (filteredProjects.length === 0) return null;
      if (prev && filteredProjects.some((p) => p.id === prev)) return prev;
      return filteredProjects[0].id;
    });
  }, [filteredProjects]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const financialRows = useMemo(
    () => buildClientFinancialRows(projects, contracts, invoices),
    [projects, contracts, invoices]
  );

  const selectedFinancialRows = useMemo(() => {
    if (!selectedProjectId) return [];
    return financialRows.filter((r) => r.project_id === selectedProjectId);
  }, [financialRows, selectedProjectId]);

  const filteredFinancial = useMemo(() => {
    if (finFilter === 'all') return selectedFinancialRows;
    return selectedFinancialRows.filter((r) => r.pending);
  }, [selectedFinancialRows, finFilter]);

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

  const archiveClient = async () => {
    if (
      !confirm(
        `封存客戶「${client?.name}」？\n將從客戶列表隱藏；專案、合約與發票紀錄仍保留。`
      )
    )
      return;
    try {
      setSaving(true);
      await api.archiveClient(id);
      router.push('/clients');
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const delClient = async () => {
    const name = client?.name || '';
    const typed = prompt(
      `永久刪除僅適用於建立錯誤的客戶。\n專案將改為無客戶；若有合約綁定將無法刪除。\n\n請輸入客戶名稱「${name}」以確認刪除：`
    );
    if (typed !== name) {
      if (typed != null) alert('名稱不符，已取消刪除');
      return;
    }
    try {
      setSaving(true);
      await api.deleteClient(id);
      router.push('/clients');
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const unarchiveClient = async () => {
    try {
      setSaving(true);
      const updated = await api.unarchiveClient(id);
      setClient(updated);
      setForm(defaultClientForm(updated));
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
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
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setForm(defaultClientForm(client));
                }}
                className="text-sm text-gray-500 px-3"
              >
                取消
              </button>
            </div>
            <div className="pt-4 mt-2 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-2">進階</p>
              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                封存會從列表隱藏但保留紀錄；永久刪除僅用於建立錯誤，且無合約綁定時才可執行。
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {client.archived_at ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={unarchiveClient}
                    className="text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 py-2 px-3 rounded-xl hover:bg-indigo-100 disabled:opacity-60"
                  >
                    取消封存
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={archiveClient}
                    className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 py-2 px-3 rounded-xl hover:bg-amber-100 disabled:opacity-60"
                  >
                    封存客戶
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={delClient}
                  className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 py-2 px-3 rounded-xl hover:bg-rose-100 disabled:opacity-60"
                >
                  永久刪除…
                </button>
              </div>
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
              <div className="flex flex-col items-end gap-1 shrink-0">
                {client.archived_at ? (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    已封存
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs font-semibold text-indigo-600"
                >
                  編輯
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden pt-3 md:pt-4 gap-3 md:gap-4">
      {/* 專案歷史 — 字卡內捲動；桌機左欄 */}
      <section
        className={`${surfaceSectionClass} ${surfacePadClass} flex flex-col min-h-0 shrink-0 max-h-[min(260px,36vh)] md:max-h-none md:h-full md:w-[min(100%,380px)] md:shrink-0`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">專案歷史</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">單擊選取 · 雙擊進入專案</p>
          </div>
          <button
            type="button"
            onClick={() => setProjectModal(true)}
            className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg"
          >
            ＋ 新專案
          </button>
        </div>
        <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg mb-2 w-fit shrink-0">
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
        <div className="scroll-pane flex-1 min-h-0 -mx-1 px-1">
          {filteredProjects.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">尚無專案</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredProjects.map((p) => {
                const st = statusStyle(p.status);
                const selected = p.id === selectedProjectId;
                const warn = projectFinancialWarnings(p.id, projects, contracts, invoices);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(p.id)}
                      onDoubleClick={() => router.push(`/projects/${p.id}`)}
                      className={`w-full text-left grid grid-cols-[minmax(0,1fr)_1.25rem_5.25rem] gap-x-2 items-center py-2 px-2 rounded-lg transition-colors ${
                        selected
                          ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200/80'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <span className="font-semibold text-slate-900 truncate min-w-0">
                        {p.name}
                      </span>
                      <ProjectWarnSlot warn={warn} />
                      <span
                        className={`justify-self-end text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.bg} ${st.text}`}
                      >
                        {p.status}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section
        className={`${surfaceSectionClass} ${surfacePadClass} flex flex-col flex-1 min-h-0 md:min-w-0 w-full`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">合約與收款</h2>
            {selectedProject ? (
              (() => {
                const meta = projectScheduleBudgetLines(selectedProject);
                const w = projectFinancialWarnings(
                  selectedProject.id,
                  projects,
                  contracts,
                  invoices
                );
                const stSel = statusStyle(selectedProject.status);
                return (
                  <div className="mt-1.5 min-w-0">
                    <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2 flex-wrap">
                      <span className="truncate">{selectedProject.name}</span>
                      <ProjectWarnSlot warn={w} />
                      <span
                        className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${stSel.bg} ${stSel.text}`}
                      >
                        {selectedProject.status}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600 tabular-nums mt-1">
                      {meta.start} — {meta.end}
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="font-semibold text-slate-800">{meta.budget}</span>
                    </p>
                  </div>
                );
              })()
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">請先選取左側專案</p>
            )}
          </div>
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg shrink-0">
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
        <p className="text-xs text-slate-500 mb-3 shrink-0 max-w-2xl">
          顯示所選專案的合約與發票；待處理含未簽約、未收款。
        </p>
        <div className="scroll-pane flex-1 min-h-0 pr-0.5">
          {!selectedProjectId ? (
            <p className="text-sm text-slate-400 py-4 text-center">尚無專案可顯示</p>
          ) : filteredFinancial.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              {finFilter === 'pending'
                ? '此專案目前沒有待簽約或未收款項目'
                : '此專案尚無合約或發票紀錄'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredFinancial.map((row) => (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="py-3.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-6 sm:items-center"
                >
                  <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        row.kind === 'invoice'
                          ? 'bg-violet-100 text-violet-800'
                          : row.kind === 'contract'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {row.kind === 'invoice' ? '收款' : row.kind === 'contract' ? '合約' : '待簽'}
                    </span>
                    <span className="text-sm font-medium text-slate-900 break-words">{row.label}</span>
                    <span className="text-xs text-slate-500 tabular-nums w-full sm:w-auto">
                      {row.date ? String(row.date).slice(0, 10) : '—'}
                    </span>
                  </div>
                  <div className="sm:text-right flex sm:flex-col items-start sm:items-end gap-1 shrink-0">
                    {row.amount != null ? (
                      <p className="text-base font-semibold tabular-nums text-slate-900">
                        {fmtCurrency(row.amount, row.currency || 'USD')}
                      </p>
                    ) : null}
                    <p
                      className={`text-xs font-semibold ${
                        row.pending ? 'text-amber-700' : 'text-emerald-600'
                      }`}
                    >
                      {finStatusZh(row.kind, row.status)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-sm shrink-0">
          <Link href="/contracts" className="text-indigo-600 font-semibold hover:text-indigo-800">
            合約管理 →
          </Link>
          <Link href="/invoices" className="text-indigo-600 font-semibold hover:text-indigo-800">
            發票管理 →
          </Link>
        </div>
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
