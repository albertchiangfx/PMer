'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import BackToDashboard from '../../components/BackToDashboard';
import { pageFrameClass, pageFrameHeaderClass, pageFrameScrollInsetClass } from '../../lib/page-layout';

function hubUrl(token) {
  if (typeof window === 'undefined') return `/c/${token}`;
  return `${window.location.origin}/c/${token}`;
}

export default function CollaborationPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [copiedId, setCopiedId] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getClientHubsOverview();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const active = new Set(['planning', 'active', 'wrapping']);
    return rows.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'active') return active.has(r.project_status);
      return !active.has(r.project_status);
    });
  }, [rows, filter]);

  const copyLink = async (row) => {
    let token = row.public_token;
    if (!token) {
      setBusy(row.project_id);
      try {
        const hub = await api.createClientHub({ project_id: row.project_id });
        token = hub.public_token;
        await load();
      } catch (e) {
        alert(e?.message || '建立失敗');
        return;
      } finally {
        setBusy(null);
      }
    }
    const url = hubUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(row.project_id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      prompt('複製客戶連結：', url);
    }
  };

  const ctl =
    'h-9 px-3 text-xs sm:text-sm border border-gray-200 rounded-lg bg-white shadow-apple-sm';

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
        <BackToDashboard />
        <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-1">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">客戶協作</h1>
            <p className="text-gray-500 text-xs md:text-sm mt-1">
              管理各專案的一頁式客戶頁面、公開報價與審稿連結
            </p>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={ctl}
            aria-label="篩選專案"
          >
            <option value="active">進行中專案</option>
            <option value="done">已結案</option>
            <option value="all">全部</option>
          </select>
        </div>
      </div>

      <div className={pageFrameScrollInsetClass}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">沒有符合的專案</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => (
              <div
                key={row.project_id}
                className="bg-white rounded-2xl border border-gray-100 shadow-apple-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0 flex gap-2.5 min-w-0">
                  <span
                    className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: row.project_color || '#6366f1' }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                  <Link
                    href={`/projects/${row.project_id}?tab=client`}
                    className="font-semibold text-gray-900 hover:text-indigo-600"
                  >
                    {row.project_name}
                  </Link>
                  {row.client_name && (
                    <p className="text-xs text-gray-500 mt-0.5">{row.client_name}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                    {row.hub_id ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                        協作頁已建立
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        尚未建立
                      </span>
                    )}
                    {row.published_quotes > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                        {row.published_quotes} 份公開報價
                      </span>
                    )}
                    {row.last_viewed_at && (
                      <span className="text-gray-400">客戶最近查看</span>
                    )}
                  </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy === row.project_id}
                    onClick={() => copyLink(row)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {copiedId === row.project_id
                      ? '已複製'
                      : busy === row.project_id
                        ? '建立中…'
                        : '複製客戶連結'}
                  </button>
                  {row.public_token && (
                    <a
                      href={`/c/${row.public_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      預覽
                    </a>
                  )}
                  <Link
                    href={`/projects/${row.project_id}?tab=client`}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    管理
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
