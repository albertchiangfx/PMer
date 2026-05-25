'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { fmt, fmtCurrency } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';
import { matchSearchHaystack } from '../../lib/search-match';
import ContractFormModal from '../../components/ContractFormModal';
import ContractGeneratorModal from '../../components/ContractGeneratorModal';
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABEL,
  contractBadgeStyle,
  contractStatusLabel,
  normalizeContractStatus,
} from '../../lib/financial-status';
import {
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollClass,
} from '../../lib/page-layout';

const listCtlClass =
  'h-9 min-h-9 py-0 px-3 text-xs sm:text-sm leading-9 bg-white border border-gray-200 rounded-lg shadow-apple-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const SORT_OPTS = [
  ['signed_date', '簽署日'],
  ['amount', '金額'],
  ['status', '狀態'],
  ['contract_number', '合約編號'],
];

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | { contract }
  const [generator, setGenerator] = useState(null); // null | { contract }

  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('signed_date');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    const [c, p, cl] = await Promise.all([
      api.getContracts(),
      api.getProjects(),
      api.getClients(),
    ]);
    setContracts(c);
    setProjects(p);
    setClients(cl);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const save = async (payload) => {
    if (modal === 'create') await api.createContract(payload);
    else await api.updateContract(modal.id, payload);
    await load();
  };

  const del = async (c) => {
    if (!confirm(`刪除合約「${c.contract_number}」？`)) return;
    await api.deleteContract(c.id);
    load();
  };

  const filtered = useMemo(() => {
    let rows = contracts.filter((c) => {
      const hay = [c.contract_number, c.project_name, c.client_name].filter(Boolean).join(' ');
      if (filter && !matchSearchHaystack(hay, filter)) return false;
      if (statusFilter && normalizeContractStatus(c.status) !== statusFilter) return false;
      if (clientFilter && String(c.client_id) !== String(clientFilter)) return false;
      if (projectFilter && String(c.project_id) !== String(projectFilter)) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (sortBy === 'amount') {
        va = parseFloat(va || 0);
        vb = parseFloat(vb || 0);
      } else if (sortBy === 'status') {
        va = normalizeContractStatus(va);
        vb = normalizeContractStatus(vb);
      } else {
        va = String(va || '');
        vb = String(vb || '');
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return rows;
  }, [contracts, filter, statusFilter, clientFilter, projectFilter, sortBy, sortDir]);

  const summary = useMemo(
    () => ({
      total: contracts.reduce((s, c) => s + parseFloat(c.amount || 0), 0),
      signed: contracts.filter((c) => normalizeContractStatus(c.status) === 'signed').length,
      pending: contracts.filter((c) => {
        const v = normalizeContractStatus(c.status);
        return v === 'unsent' || v === 'sent';
      }).length,
    }),
    [contracts]
  );

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
        <BackToDashboard className="mb-2 md:mb-4" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">全部合約</h1>
            <p className="text-gray-400 mt-1 text-xs md:text-sm">共 {contracts.length} 份</p>
          </div>
          <button
            onClick={() => setModal('create')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
          >
            ＋ 新合約
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4">
          <Card label="合約總額" value={fmtCurrency(summary.total, 'TWD')} />
          <Card label="已回簽" value={summary.signed} valueClass="text-emerald-600" />
          <Card label="待簽署" value={summary.pending} valueClass="text-amber-600" />
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜尋合約編號 / 專案 / 客戶..."
            className={`flex-1 min-w-[180px] max-w-md ${listCtlClass}`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`w-[7rem] ${listCtlClass}`}
            aria-label="狀態篩選"
          >
            <option value="">全部狀態</option>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTRACT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className={`w-[8.5rem] ${listCtlClass}`}
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
            className={`w-[9rem] ${listCtlClass}`}
            aria-label="專案篩選"
          >
            <option value="">全部專案</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={`w-[7.5rem] ${listCtlClass}`}
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
            className={`w-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 ${listCtlClass}`}
            aria-label="排序方向"
            title={sortDir === 'asc' ? '升冪' : '降冪'}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className={pageFrameScrollClass}>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">沒有符合條件的合約</div>
        ) : (
          <div className="bg-white rounded-apple-xl shadow-apple overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-slate-50/50">
                  {['合約編號', '專案', '客戶', '金額', '簽署日', '到期日', '狀態', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const s = contractBadgeStyle(c.status);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-700 font-medium">
                        {c.contract_number}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-700">
                        {c.project_id ? (
                          <Link
                            href={`/projects/${c.project_id}`}
                            className="hover:text-indigo-600"
                          >
                            {c.project_name}
                          </Link>
                        ) : (
                          c.project_name
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">
                        {c.client_id ? (
                          <Link href={`/clients/${c.client_id}`} className="hover:text-indigo-600">
                            {c.client_name}
                          </Link>
                        ) : (
                          c.client_name
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 tabular-nums">
                        {fmtCurrency(c.amount, c.currency)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 tabular-nums">
                        {fmt(c.signed_date)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 tabular-nums">
                        {fmt(c.expiry_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {contractStatusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setGenerator(c)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                          >
                            產生 PDF
                          </button>
                          <button
                            onClick={() => setModal(c)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => del(c)}
                            className="text-xs text-red-500 hover:text-red-600 font-medium"
                          >
                            刪除
                          </button>
                          {c.file_path && (
                            <a
                              href={c.file_path}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                            >
                              檔案
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ContractFormModal
        open={!!modal}
        mode={modal === 'create' ? 'create' : 'edit'}
        initial={modal && modal !== 'create' ? modal : null}
        projects={projects}
        clients={clients}
        onClose={() => setModal(null)}
        onSubmit={save}
      />

      <ContractGeneratorModal
        open={!!generator}
        contract={generator}
        onClose={() => setGenerator(null)}
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
