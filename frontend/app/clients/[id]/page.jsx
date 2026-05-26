'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { buildClientFinancialRows } from '../../../lib/client-financial';
import { filterAndSortProjects } from '../../../lib/project-list-sort';
import { fmt, fmtCurrency, statusStyle } from '../../../lib/utils';
import {
  contractStatusLabel,
  invoiceStatusLabel,
  normalizeContractStatus,
  normalizeInvoiceStatus,
} from '../../../lib/financial-status';
import BackToDashboard from '../../../components/BackToDashboard';
import ContractFormModal from '../../../components/ContractFormModal';
import InvoiceFormModal from '../../../components/InvoiceFormModal';
import ContractGeneratorModal from '../../../components/ContractGeneratorModal';
import QuotationFormModal from '../../../components/QuotationFormModal';
import QuotationPreviewModal from '../../../components/QuotationPreviewModal';
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

function toIsoDay(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function addDaysToDateLike(value, days) {
  const iso = toIsoDay(value);
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 計算單一專案的合約 / 發票狀態，每個值為 'ok' | 'pending' | 'overdue'。 */
function projectFinancialStates(projectId, projects, contracts, invoices) {
  const pid = String(projectId);
  const p = (projects || []).find((x) => String(x.id) === pid);
  const today = new Date().toISOString().slice(0, 10);
  const projectEnd = toIsoDay(p?.end_date);

  const contractRows = (contracts || []).filter((c) => String(c.project_id) === pid);
  const liveContracts = contractRows.filter(
    (c) => normalizeContractStatus(c.status) !== 'cancelled'
  );
  let contract = 'pending';
  if (liveContracts.some((c) => normalizeContractStatus(c.status) === 'signed')) {
    contract = 'ok';
  } else if (projectEnd && projectEnd < today) {
    contract = 'overdue';
  }

  const invoiceRows = (invoices || []).filter((i) => String(i.project_id) === pid);
  const liveInvoices = invoiceRows.filter(
    (i) => normalizeInvoiceStatus(i.status) !== 'cancelled'
  );
  let invoice;
  if (liveInvoices.length === 0) {
    invoice = projectEnd && projectEnd < today ? 'overdue' : 'pending';
  } else if (liveInvoices.every((i) => normalizeInvoiceStatus(i.status) === 'paid')) {
    invoice = 'ok';
  } else {
    const anyDueOverdue = liveInvoices.some((i) => {
      if (normalizeInvoiceStatus(i.status) === 'paid') return false;
      const due = toIsoDay(i.due_date);
      return due && due < today;
    });
    if (anyDueOverdue) invoice = 'overdue';
    else if (projectEnd && projectEnd < today) invoice = 'overdue';
    else invoice = 'pending';
  }

  return { contract, invoice };
}

const ROW_TONE_ICON = {
  ok: 'text-emerald-600',
  pending: 'text-amber-600',
  overdue: 'text-rose-600',
};

const ROW_STATE_LABEL = {
  contract: { ok: '合約：已回簽', pending: '合約：待簽署', overdue: '合約：已逾期' },
  invoice: { ok: '發票：已收齊', pending: '發票：待處理', overdue: '發票：已逾期' },
};

function RowStatusIcon({ kind, state, size = 16 }) {
  const color = ROW_TONE_ICON[state] || ROW_TONE_ICON.pending;
  const title = ROW_STATE_LABEL[kind][state];
  if (state === 'ok') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={`shrink-0 ${color}`}
        aria-label={title}
      >
        <title>{title}</title>
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.18" />
        <path
          d="M5.5 10.5 8.5 13.5 14.5 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'invoice') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={`shrink-0 ${color}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label={title}
      >
        <title>{title}</title>
        <path d="M4 3h12v14l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L4 17z" />
        <line x1="10" y1="6.5" x2="10" y2="10.5" />
        <circle cx="10" cy="13" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={`shrink-0 ${color}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={title}
    >
      <title>{title}</title>
      <path d="M5 2.5h7l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
      <path d="M12 2.5v3h3" />
      <line x1="10" y1="9" x2="10" y2="12.5" />
      <circle cx="10" cy="14.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 固定寬度欄，永遠顯示「合約 / 發票」兩個狀態圖示。 */
function ProjectStatusPair({ states }) {
  return (
    <div className="flex items-center justify-center gap-0.5 shrink-0">
      <RowStatusIcon kind="contract" state={states.contract} />
      <RowStatusIcon kind="invoice" state={states.invoice} />
    </div>
  );
}

function projectScheduleBudgetLines(p) {
  const start = p.start_date ? fmt(p.start_date, 'yyyy/MM/dd') : '—';
  const end = p.end_date ? fmt(p.end_date, 'yyyy/MM/dd') : '—';
  const budget = p.budget != null ? fmtCurrency(p.budget) : '—';
  return { start, end, budget };
}

function finStatusInfo(kind, status) {
  if (kind === 'missing_contract') {
    return { label: '待簽約', tone: 'pending', iconKind: 'contract' };
  }
  if (kind === 'contract') {
    const v = normalizeContractStatus(status);
    const tone = v === 'signed' ? 'done' : v === 'cancelled' ? 'muted' : 'pending';
    return { label: contractStatusLabel(status), tone, iconKind: 'contract' };
  }
  const v = normalizeInvoiceStatus(status);
  const tone = v === 'paid' ? 'done' : v === 'cancelled' ? 'muted' : 'pending';
  return { label: invoiceStatusLabel(status), tone, iconKind: 'invoice' };
}

const TONE_TEXT = {
  pending: 'text-amber-700',
  done: 'text-emerald-600',
  muted: 'text-slate-400',
};

const TONE_ICON = {
  pending: 'text-amber-600',
  done: 'text-emerald-600',
  muted: 'text-slate-400',
};

function StatusIcon({ iconKind, tone, size = 16 }) {
  const color = TONE_ICON[tone] || TONE_ICON.pending;
  if (tone === 'done') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={`shrink-0 ${color}`}
        aria-hidden
      >
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
        <path
          d="M5.5 10.5 8.5 13.5 14.5 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (tone === 'muted') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={`shrink-0 ${color}`}
        aria-hidden
      >
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
        <path
          d="M7 7l6 6M13 7l-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (iconKind === 'invoice') {
    // 收款待處理：發票形（凹底）+ 警示驚嘆
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={`shrink-0 ${color}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 3h12v14l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L4 17z" />
        <line x1="10" y1="6.5" x2="10" y2="10.5" />
        <circle cx="10" cy="13" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // 合約待處理：文件形（折角）+ 警示驚嘆
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={`shrink-0 ${color}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 2.5h7l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
      <path d="M12 2.5v3h3" />
      <line x1="10" y1="9" x2="10" y2="12.5" />
      <circle cx="10" cy="14.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(defaultClientForm());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');
  const [finFilter, setFinFilter] = useState('all');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectModal, setProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [contractModal, setContractModal] = useState(null); // null | 'create' | { contract }
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [generatorContract, setGeneratorContract] = useState(null);
  const [quotationModal, setQuotationModal] = useState(null); // null | 'create' | quotation
  const [quotationPreview, setQuotationPreview] = useState(null);

  const load = useCallback(async () => {
    const [c, p, ct, inv, qs] = await Promise.all([
      api.getClient(id),
      api.getProjects({ client_id: id }),
      api.getContracts({ client_id: id }),
      api.getInvoices({ client_id: id }),
      api.getQuotations({ client_id: id }),
    ]);
    setClient(c);
    setForm(defaultClientForm(c));
    setProjects(Array.isArray(p) ? p : []);
    setContracts(Array.isArray(ct) ? ct : []);
    setInvoices(Array.isArray(inv) ? inv : []);
    setQuotations(Array.isArray(qs) ? qs : []);
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
                const states = projectFinancialStates(p.id, projects, contracts, invoices);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(p.id)}
                      onDoubleClick={() => router.push(`/projects/${p.id}`)}
                      className={`w-full text-left grid grid-cols-[minmax(0,1fr)_2.5rem_5.25rem] gap-x-2 items-center py-2 px-2 rounded-lg transition-colors ${
                        selected
                          ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200/80'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <span className="font-semibold text-slate-900 truncate min-w-0">
                        {p.name}
                      </span>
                      <ProjectStatusPair states={states} />
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
            <h2 className="text-sm font-bold text-slate-900">報價・合約・收款</h2>
            {selectedProject ? (
              (() => {
                const meta = projectScheduleBudgetLines(selectedProject);
                const states = projectFinancialStates(
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
                      <ProjectStatusPair states={states} />
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
          <div className="flex items-center gap-2 shrink-0">
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
            {selectedProject ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setQuotationModal('create')}
                  className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-md hover:bg-amber-100"
                >
                  ＋ 報價單
                </button>
                <button
                  type="button"
                  onClick={() => setContractModal('create')}
                  className="text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-1 rounded-md hover:bg-sky-100"
                >
                  ＋ 合約
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceModal('create')}
                  className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-md hover:bg-violet-100"
                >
                  ＋ 發票
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3 shrink-0 max-w-2xl">
          顯示所選專案的報價單、合約與發票；待處理含未簽約、未收款。
        </p>
        <div className="scroll-pane flex-1 min-h-0 pr-0.5">
          {selectedProjectId ? (
            (() => {
              const projQuotes = quotations.filter(
                (q) => String(q.project_id) === String(selectedProjectId)
              );
              if (!projQuotes.length) return null;
              return (
                <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/40 p-2">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="text-[11px] font-semibold text-amber-800">
                      報價單 <span className="text-amber-500">({projQuotes.length})</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-amber-100">
                    {projQuotes.map((q) => (
                      <li
                        key={q.id}
                        className="px-1.5 py-1.5 flex items-center gap-2 group hover:bg-white/60 rounded-md"
                      >
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                          {q.status === 'accepted'
                            ? '已接受'
                            : q.status === 'sent'
                              ? '已寄出'
                              : q.status === 'rejected'
                                ? '已拒絕'
                                : q.status === 'expired'
                                  ? '已過期'
                                  : '草稿'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-800 truncate">
                            {q.title || q.quote_number}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {q.quote_number} · 開立 {fmt(q.issued_date)}
                            {q.valid_until ? ` · 有效至 ${fmt(q.valid_until)}` : ''}
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums text-slate-900 shrink-0">
                          {fmtCurrency(q.total, q.currency)}
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const full = await api.getQuotation(q.id);
                                setQuotationPreview(full);
                              } catch (e) {
                                alert(e.message || String(e));
                              }
                            }}
                            className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const full = await api.getQuotation(q.id);
                                setQuotationModal(full);
                              } catch (e) {
                                alert(e.message || String(e));
                              }
                            }}
                            className="text-[11px] text-indigo-600 hover:text-indigo-700"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`刪除報價單 ${q.quote_number}？`)) return;
                              try {
                                await api.deleteQuotation(q.id);
                                await load();
                              } catch (e) {
                                alert(e.message || String(e));
                              }
                            }}
                            className="text-[11px] text-red-500 hover:text-red-600"
                          >
                            刪除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()
          ) : null}
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
              {filteredFinancial.map((row) => {
                const info = finStatusInfo(row.kind, row.status);
                const editable = row.kind === 'contract' || row.kind === 'invoice';
                const original =
                  row.kind === 'contract'
                    ? contracts.find((c) => c.id === row.id)
                    : row.kind === 'invoice'
                      ? invoices.find((i) => i.id === row.id)
                      : null;
                return (
                  <li
                    key={`${row.kind}-${row.id}`}
                    className="group py-3.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-6 sm:items-center"
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
                      <span className="text-sm font-medium text-slate-900 break-words">
                        {row.label}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums w-full sm:w-auto">
                        {row.date ? String(row.date).slice(0, 10) : '—'}
                      </span>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {row.amount != null ? (
                        <p className="text-base font-semibold tabular-nums text-slate-900">
                          {fmtCurrency(row.amount, row.currency || 'USD')}
                        </p>
                      ) : null}
                      <div className="flex items-center justify-end gap-3">
                        <div className="flex items-center gap-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          {row.kind === 'missing_contract' ? (
                            <button
                              type="button"
                              onClick={() => setContractModal('create')}
                              className="text-sky-700 hover:text-sky-900 font-semibold"
                            >
                              建立合約
                            </button>
                          ) : null}
                          {editable && original ? (
                            <>
                              {row.kind === 'contract' ? (
                                <button
                                  type="button"
                                  onClick={() => setGeneratorContract(original)}
                                  className="text-emerald-600 hover:text-emerald-800 font-semibold"
                                >
                                  PDF
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  row.kind === 'contract'
                                    ? setContractModal(original)
                                    : setInvoiceModal(original)
                                }
                                className="text-indigo-600 hover:text-indigo-800 font-semibold"
                              >
                                編輯
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const label = row.kind === 'contract' ? '合約' : '發票';
                                  if (!confirm(`刪除${label}「${row.label}」？`)) return;
                                  try {
                                    if (row.kind === 'contract')
                                      await api.deleteContract(row.id);
                                    else await api.deleteInvoice(row.id);
                                    await load();
                                  } catch (e) {
                                    alert(e.message || String(e));
                                  }
                                }}
                                className="text-rose-600 hover:text-rose-800 font-semibold"
                              >
                                刪除
                              </button>
                            </>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-[5.5rem] justify-end">
                          <StatusIcon iconKind={info.iconKind} tone={info.tone} />
                          <span
                            className={`text-xs font-semibold whitespace-nowrap ${
                              TONE_TEXT[info.tone] || TONE_TEXT.pending
                            }`}
                          >
                            {info.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-sm shrink-0">
          <Link href="/quotations" className="text-indigo-600 font-semibold hover:text-indigo-800">
            全部報價單 →
          </Link>
          <Link href="/contracts" className="text-indigo-600 font-semibold hover:text-indigo-800">
            全部合約 →
          </Link>
          <Link href="/invoices" className="text-indigo-600 font-semibold hover:text-indigo-800">
            全部發票 →
          </Link>
        </div>
      </section>
      </div>

      <QuotationFormModal
        open={!!quotationModal}
        mode={quotationModal === 'create' ? 'create' : 'edit'}
        initial={quotationModal && quotationModal !== 'create' ? quotationModal : null}
        defaults={{
          project_id: selectedProjectId,
          client_id: id,
          currency: 'TWD',
          title: selectedProject?.name || '',
        }}
        projects={projects}
        clients={client ? [client] : []}
        lockClient
        onClose={() => setQuotationModal(null)}
        onSubmit={async (payload) => {
          if (quotationModal === 'create') await api.createQuotation(payload);
          else await api.updateQuotation(quotationModal.id, payload);
          await load();
        }}
      />

      <QuotationPreviewModal
        open={!!quotationPreview}
        quotation={quotationPreview}
        onClose={() => setQuotationPreview(null)}
        onGenerated={load}
      />

      <ContractFormModal
        open={!!contractModal}
        mode={contractModal === 'create' ? 'create' : 'edit'}
        initial={contractModal && contractModal !== 'create' ? contractModal : null}
        defaults={{
          project_id: selectedProjectId,
          client_id: id,
          currency: 'TWD',
          effective_date: selectedProject?.start_date || '',
          expiry_date: addDaysToDateLike(selectedProject?.end_date, 30),
        }}
        projects={projects}
        clients={client ? [client] : []}
        lockClient
        onClose={() => setContractModal(null)}
        onSubmit={async (payload) => {
          if (contractModal === 'create') await api.createContract(payload);
          else await api.updateContract(contractModal.id, payload);
          await load();
        }}
      />

      <InvoiceFormModal
        open={!!invoiceModal}
        mode={invoiceModal === 'create' ? 'create' : 'edit'}
        initial={invoiceModal && invoiceModal !== 'create' ? invoiceModal : null}
        defaults={{ project_id: selectedProjectId, currency: 'TWD' }}
        projects={projects}
        contracts={contracts}
        onClose={() => setInvoiceModal(null)}
        onSubmit={async (payload) => {
          if (invoiceModal === 'create') await api.createInvoice(payload);
          else await api.updateInvoice(invoiceModal.id, payload);
          await load();
        }}
      />

      <ContractGeneratorModal
        open={!!generatorContract}
        contract={generatorContract}
        onClose={() => setGeneratorContract(null)}
        onGenerated={load}
      />

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
