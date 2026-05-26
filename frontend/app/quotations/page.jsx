'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { fmt, fmtCurrency } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';
import { matchSearchHaystack } from '../../lib/search-match';
import QuotationFormModal from '../../components/QuotationFormModal';
import QuotationPreviewModal from '../../components/QuotationPreviewModal';
import {
  cardClass,
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollInsetClass,
} from '../../lib/page-layout';

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
const QUOTE_STATUS_LABEL = {
  draft: '草稿',
  sent: '已寄出',
  accepted: '已接受',
  rejected: '已拒絕',
  expired: '已過期',
};
const QUOTE_BADGE = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  sent: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  accepted: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  expired: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

const listCtlClass =
  'h-9 min-h-9 py-0 px-3 text-xs sm:text-sm leading-9 bg-white border border-gray-200 rounded-lg shadow-apple-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const SORT_OPTS = [
  ['issued_date', '開立日'],
  ['valid_until', '有效期'],
  ['total', '總額'],
  ['status', '狀態'],
  ['quote_number', '報價單編號'],
];

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | quotation
  const [preview, setPreview] = useState(null); // null | quotation

  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('issued_date');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    const [q, p, c] = await Promise.all([
      api.getQuotations(),
      api.getProjects(),
      api.getClients(),
    ]);
    setQuotations(q);
    setProjects(p);
    setClients(c);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const openEdit = async (q) => {
    try {
      const full = await api.getQuotation(q.id);
      setModal(full);
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const save = async (payload) => {
    if (modal === 'create') await api.createQuotation(payload);
    else await api.updateQuotation(modal.id, payload);
    await load();
  };

  const del = async (q) => {
    if (!confirm(`刪除報價單「${q.quote_number}」？`)) return;
    await api.deleteQuotation(q.id);
    load();
  };

  const cloneOne = async (q) => {
    try {
      const created = await api.cloneQuotation(q.id);
      await load();
      alert(`已複製為新報價單 ${created.quote_number}（狀態：草稿），可進入編輯`);
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const filtered = useMemo(() => {
    let rows = quotations.filter((q) => {
      const hay = [q.quote_number, q.title, q.project_name, q.client_name]
        .filter(Boolean)
        .join(' ');
      if (filter && !matchSearchHaystack(hay, filter)) return false;
      if (statusFilter && q.status !== statusFilter) return false;
      if (clientFilter && String(q.client_id) !== String(clientFilter)) return false;
      if (projectFilter && String(q.project_id) !== String(projectFilter)) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (sortBy === 'total') {
        va = parseFloat(va || 0);
        vb = parseFloat(vb || 0);
      } else {
        va = String(va || '');
        vb = String(vb || '');
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return rows;
  }, [quotations, filter, statusFilter, clientFilter, projectFilter, sortBy, sortDir]);

  const summary = useMemo(
    () => ({
      total: quotations.reduce((s, q) => s + parseFloat(q.total || 0), 0),
      accepted: quotations.filter((q) => q.status === 'accepted').length,
      sent: quotations.filter((q) => q.status === 'sent').length,
    }),
    [quotations]
  );

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
        <BackToDashboard className="mb-2 md:mb-4" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">
              全部報價單
            </h1>
            <p className="text-gray-400 mt-1 text-xs md:text-sm">共 {quotations.length} 份</p>
          </div>
          <button
            onClick={() => setModal('create')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
          >
            ＋ 新報價單
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4">
          <Card label="報價總額" value={fmtCurrency(summary.total, 'TWD')} />
          <Card label="已接受" value={summary.accepted} valueClass="text-emerald-600" />
          <Card label="已寄出" value={summary.sent} valueClass="text-blue-600" />
        </div>

        {/* 手機：2-col grid 排版；桌面：sm:flex 內聯一行 */}
        <div className="pb-0.5 grid grid-cols-2 gap-1.5 w-full sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜尋編號 / 標題 / 專案 / 客戶..."
            className={`col-span-2 min-w-0 w-full sm:flex-none sm:w-auto sm:max-w-xs ${listCtlClass}`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`min-w-0 w-full sm:flex-none sm:w-[7rem] ${listCtlClass}`}
            aria-label="狀態篩選"
          >
            <option value="">全部狀態</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUOTE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className={`min-w-0 w-full sm:flex-none sm:w-[8rem] ${listCtlClass}`}
            aria-label="客戶篩選"
          >
            <option value="">全部客戶</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={`min-w-0 w-full sm:flex-none sm:w-[8rem] ${listCtlClass}`}
            aria-label="專案篩選"
          >
            <option value="">全部專案</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 min-w-0 sm:gap-2 sm:contents">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`flex-1 min-w-0 sm:flex-none sm:w-[7.5rem] ${listCtlClass}`}
              aria-label="排序欄位"
            >
              {SORT_OPTS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className={`shrink-0 w-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 ${listCtlClass}`}
              title={sortDir === 'asc' ? '升冪' : '降冪'}
              aria-label={sortDir === 'asc' ? '排序：遞增' : '排序：遞減'}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      <div className={pageFrameScrollInsetClass}>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-apple-lg shadow-apple p-16 text-center">
            <p className="text-gray-400 text-sm">沒有符合條件的報價單</p>
            <button
              onClick={() => setModal('create')}
              className="mt-4 text-indigo-600 text-sm font-medium hover:text-indigo-700"
            >
              + 建立第一份報價單
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:gap-4">
            {filtered.map((q) => (
              <QuotationRow
                key={q.id}
                quotation={q}
                onPreview={() => setPreview(q)}
                onEdit={() => openEdit(q)}
                onClone={() => cloneOne(q)}
                onDelete={() => del(q)}
              />
            ))}
          </div>
        )}
      </div>

      <QuotationFormModal
        open={!!modal}
        mode={modal === 'create' ? 'create' : 'edit'}
        initial={modal && modal !== 'create' ? modal : null}
        projects={projects}
        clients={clients}
        onClose={() => setModal(null)}
        onSubmit={save}
      />

      <QuotationPreviewModal
        open={!!preview}
        quotation={preview}
        onClose={() => setPreview(null)}
        onGenerated={load}
      />
    </div>
  );
}

function Card({ label, value, valueClass = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-apple-lg shadow-apple p-3 md:p-5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg md:text-2xl font-bold mt-1 tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function QuotationRow({ quotation: q, onPreview, onEdit, onClone, onDelete }) {
  const s = QUOTE_BADGE[q.status] || QUOTE_BADGE.draft;
  const label = QUOTE_STATUS_LABEL[q.status] || q.status;
  const titleText = q.title || q.project_name || q.quote_number;

  return (
    <div
      className={`${cardClass} flex flex-col gap-2 md:gap-2.5 hover:shadow-apple-lg duration-200 group`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0 py-0.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-2.5 h-9 rounded-full shrink-0 bg-indigo-500" />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onPreview}
              className="text-left text-base font-semibold text-gray-900 hover:text-indigo-600 leading-tight truncate block max-w-full"
              title={titleText}
            >
              {titleText}
            </button>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">
              <p className="text-[11px] font-mono text-gray-500">{q.quote_number}</p>
              {q.project_id ? (
                <Link
                  href={`/projects/${q.project_id}`}
                  className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600 truncate max-w-[10rem]"
                  title={q.project_name}
                >
                  {q.project_name}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Desktop columns */}
        <div className="hidden sm:contents">
          <div className="w-[7rem] shrink-0 text-right min-w-0">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">客戶</p>
            {q.client_id ? (
              <Link
                href={`/clients/${q.client_id}`}
                className="text-[11px] font-medium text-gray-700 hover:text-indigo-600 truncate leading-tight block"
                title={q.client_name}
              >
                {q.client_name || '—'}
              </Link>
            ) : (
              <p className="text-[11px] font-medium text-gray-700 truncate leading-tight">
                {q.client_name || '—'}
              </p>
            )}
          </div>
          <div className="w-[6.5rem] shrink-0 text-right">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">總額</p>
            <p className="text-sm font-bold text-gray-900 tabular-nums leading-tight">
              {fmtCurrency(q.total, q.currency)}
            </p>
          </div>
          <div className="w-[5.75rem] shrink-0 text-right">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">開立日</p>
            <p className="text-[11px] text-gray-600 tabular-nums leading-tight">
              {fmt(q.issued_date) || '—'}
            </p>
          </div>
          <div className="w-[5.75rem] shrink-0 text-right">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">有效期</p>
            <p className="text-[11px] text-gray-600 tabular-nums leading-tight">
              {fmt(q.valid_until) || '—'}
            </p>
          </div>
          <div className="w-[5.25rem] shrink-0 flex justify-end">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.bg} ${s.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {label}
            </span>
          </div>
          <div className="flex gap-2 justify-end shrink-0 opacity-0 group-hover:opacity-100 min-w-[8.5rem]">
            <button
              type="button"
              onClick={onPreview}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
            >
              PDF
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={onClone}
              className="text-xs text-slate-600 hover:text-slate-800 font-medium"
            >
              複製
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              刪除
            </button>
          </div>
        </div>

        {/* Mobile inline strip */}
        <div className="sm:hidden flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-gray-600 pl-5">
          <span className="font-medium text-gray-700">{q.client_name || '—'}</span>
          <span className="font-bold text-gray-900 text-sm">{fmtCurrency(q.total, q.currency)}</span>
          <span>{fmt(q.issued_date) || '—'} → {fmt(q.valid_until) || '—'}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.bg} ${s.text}`}>{label}</span>
        </div>
      </div>

      {/* Mobile actions row（手機板用 group-hover 不會出現，直接顯示） */}
      <div className="sm:hidden flex items-center gap-4 pt-2 border-t border-gray-100 text-xs">
        <button
          type="button"
          onClick={onPreview}
          className="text-emerald-600 font-semibold"
        >
          PDF
        </button>
        <button type="button" onClick={onEdit} className="text-indigo-600 font-medium">
          編輯
        </button>
        <button type="button" onClick={onClone} className="text-slate-600 font-medium">
          複製
        </button>
        <button type="button" onClick={onDelete} className="text-red-500 font-medium">
          刪除
        </button>
        {q.pdf_path ? (
          <a
            href={q.pdf_path}
            target="_blank"
            rel="noreferrer"
            className="text-gray-500 font-medium ml-auto"
          >
            開啟舊檔
          </a>
        ) : null}
      </div>
    </div>
  );
}
