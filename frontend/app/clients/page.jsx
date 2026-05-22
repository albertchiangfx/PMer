'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { summarizeClientAlerts } from '../../lib/client-financial';
import { matchSearchHaystack } from '../../lib/search-match';
import BackToDashboard from '../../components/BackToDashboard';
import {
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollInsetClass,
  cardClass,
} from '../../lib/page-layout';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('all'); // all | pending
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);

  function defaultForm() {
    return { name: '', contact_email: '', contact_phone: '', address: '' };
  }

  const load = useCallback(async () => {
    const [cl, p, ct, inv] = await Promise.all([
      api.getClients(),
      api.getProjects(),
      api.getContracts(),
      api.getInvoices(),
    ]);
    setClients(Array.isArray(cl) ? cl : []);
    setProjects(Array.isArray(p) ? p : []);
    setContracts(Array.isArray(ct) ? ct : []);
    setInvoices(Array.isArray(inv) ? inv : []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => alert(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  const enriched = useMemo(() => {
    const byClient = new Map();
    for (const c of clients) {
      byClient.set(String(c.id).toLowerCase(), {
        client: c,
        projects: [],
        contracts: [],
        invoices: [],
      });
    }
    for (const p of projects) {
      const k = String(p.client_id || '').toLowerCase();
      if (!k || !byClient.has(k)) continue;
      byClient.get(k).projects.push(p);
    }
    for (const ct of contracts) {
      const k = String(ct.client_id || '').toLowerCase();
      if (!k || !byClient.has(k)) continue;
      byClient.get(k).contracts.push(ct);
    }
    for (const inv of invoices) {
      const k = String(inv.client_id || '').toLowerCase();
      if (!k || !byClient.has(k)) continue;
      byClient.get(k).invoices.push(inv);
    }
    return [...byClient.values()].map(({ client, projects: ps, contracts: cs, invoices: is }) => {
      const alerts = summarizeClientAlerts(ps, cs, is);
      const latest = ps
        .map((p) => p.updated_at || p.end_date || p.created_at)
        .sort()
        .reverse()[0];
      return { client, projectCount: ps.length, alerts, latest };
    });
  }, [clients, projects, contracts, invoices]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (alertFilter === 'pending') {
      rows = rows.filter(({ alerts }) => alerts.pendingCount > 0);
    }
    const q = filter.trim();
    if (!q) return rows;
    return rows.filter(({ client }) => {
      const hay = [client.name, client.contact_email, client.contact_phone, client.address]
        .filter(Boolean)
        .join(' ');
      return matchSearchHaystack(hay, q);
    });
  }, [enriched, filter, alertFilter]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('請填寫客戶名稱');
      return;
    }
    try {
      setSaving(true);
      if (modal === 'create') await api.createClient(form);
      else await api.updateClient(modal.id, form);
      setModal(null);
      await load();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setForm(defaultForm());
    setModal('create');
  };

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
      <BackToDashboard className="mb-2 md:mb-4" />

      <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">客戶</h1>
          <p className="text-gray-400 mt-0.5 text-xs md:text-sm">
            {clients.length} 位客戶 · 待簽約／待收款一目了然
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 md:px-4 md:py-2.5 rounded-xl shadow-apple-sm"
        >
          ＋ 新增
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mb-2 md:mb-6">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜尋客戶名稱、Email、電話…"
          className="w-full sm:max-w-md h-8 min-h-8 py-0 px-2.5 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg shadow-apple-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg shrink-0 w-fit">
          {[
            ['all', '全部'],
            ['pending', '待處理'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAlertFilter(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                alertFilter === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      </div>

      <div className={pageFrameScrollInsetClass}>
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className={`${cardClass} py-12 text-center text-sm text-slate-500`}>
          {clients.length === 0 ? (
            <>
              <p>尚無客戶</p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-3 text-indigo-600 font-semibold text-sm"
              >
                建立第一位客戶
              </button>
            </>
          ) : (
            <p>沒有符合的搜尋結果</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:gap-3">
          {filtered.map(({ client, projectCount, alerts, latest }) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className={`${cardClass} block hover:shadow-apple-md transition-shadow active:bg-slate-50/80`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 truncate">{client.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {client.contact_email || client.contact_phone || '無聯絡方式'}
                  </p>
                </div>
                <div className="text-right shrink-0 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700 tabular-nums">{projectCount} 專案</p>
                  {latest ? <p className="mt-0.5">{String(latest).slice(0, 10)}</p> : null}
                </div>
              </div>
              {alerts.pendingCount > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {alerts.unsignedCount > 0 ? (
                    <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 text-[10px] font-semibold">
                      待簽約 {alerts.unsignedCount}
                    </span>
                  ) : null}
                  {alerts.unpaidCount > 0 ? (
                    <span className="rounded-full bg-rose-50 text-rose-800 border border-rose-200/80 px-2 py-0.5 text-[10px] font-semibold">
                      待收款 {alerts.unpaidCount}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-emerald-600 font-medium">合約／收款皆已結清</p>
              )}
            </Link>
          ))}
        </div>
      )}
      </div>

      {modal ? (
        <ClientFormModal
          title={modal === 'create' ? '新增客戶' : '編輯客戶'}
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={save}
        />
      ) : null}
    </div>
  );
}

function ClientFormModal({ title, form, setForm, saving, onClose, onSubmit }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">名稱 *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">電話</label>
            <input
              value={form.contact_phone}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">地址</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-gray-500">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
