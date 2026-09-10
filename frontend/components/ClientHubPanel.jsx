'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { fmtCurrency } from '../lib/utils';
import { useDragScroll } from '../lib/use-drag-scroll';

function hubUrl(token) {
  if (typeof window === 'undefined') return `/c/${token}`;
  return `${window.location.origin}/c/${token}`;
}

const QUOTE_STATUS_LABEL = {
  draft: '草稿',
  sent: '已寄出',
  viewed: '客戶已看',
  accepted: '已接受',
  rejected: '已婉拒',
  expired: '已過期',
};

export default function ClientHubPanel({
  projectId,
  projectName,
  projectColor,
  clientName,
}) {
  const [resolvedColor, setResolvedColor] = useState(projectColor || null);
  const accent = resolvedColor || projectColor || '#6366f1';
  const [hub, setHub] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState('');
  const [linkForm, setLinkForm] = useState({ label: '', url: '' });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [h, qs] = await Promise.all([
        api.getClientHubByProject(projectId),
        api.getQuotations({ project_id: projectId }),
      ]);
      setHub(h);
      setWelcome(h?.welcome_message || '');
      setQuotations(Array.isArray(qs) ? qs : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setResolvedColor(projectColor || null);
  }, [projectColor]);

  useEffect(() => {
    if (projectColor || !projectId) return;
    let cancelled = false;
    api
      .getProject(projectId)
      .then((p) => {
        if (!cancelled && p?.color) setResolvedColor(p.color);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, projectColor]);

  const publishedCount = useMemo(
    () => quotations.filter((q) => q.client_visible).length,
    [quotations]
  );

  const quoteScrollerRef = useDragScroll(quotations.length > 0);

  const ensureHub = async () => {
    setBusy(true);
    try {
      const h = await api.createClientHub({
        project_id: projectId,
        title: projectName,
        welcome_message: welcome || null,
      });
      setHub(h);
      return h;
    } finally {
      setBusy(false);
    }
  };

  const saveWelcome = async () => {
    let h = hub;
    if (!h) h = await ensureHub();
    setBusy(true);
    try {
      const updated = await api.updateClientHub(h.id, { welcome_message: welcome });
      setHub(updated);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    let h = hub;
    if (!h) h = await ensureHub();
    const url = hubUrl(h.public_token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('複製客戶連結：', url);
    }
  };

  const regenerateToken = async () => {
    if (!hub) return;
    if (!confirm('重設後舊連結將失效，確定要重設客戶頁連結？')) return;
    setBusy(true);
    try {
      const updated = await api.regenerateClientHubToken(hub.id);
      setHub(updated);
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (q) => {
    setBusy(true);
    try {
      if (q.client_visible) await api.unpublishQuotation(q.id);
      else await api.publishQuotation(q.id);
      await load();
    } catch (e) {
      alert(e?.message || '操作失敗');
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    if (!linkForm.label.trim() || !linkForm.url.trim()) return;
    let h = hub;
    if (!h) h = await ensureHub();
    setBusy(true);
    try {
      await api.addClientHubLink(h.id, {
        kind: 'review',
        label: linkForm.label.trim(),
        url: linkForm.url.trim(),
      });
      setLinkForm({ label: '', url: '' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (linkId) => {
    if (!confirm('刪除此連結？')) return;
    setBusy(true);
    try {
      await api.deleteClientHubLink(linkId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm"
        style={{ borderColor: `${accent}33`, background: `${accent}0d`, color: accent }}
      >
        載入客戶協作頁…
      </div>
    );
  }

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">客戶協作設定</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
            複製連結給客戶 PM 查看進度、比較報價（與 PDF 同款）、審稿外連。亦可從左側「客戶協作」總覽管理。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={copyLink}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {copied ? '已複製' : '複製客戶連結'}
          </button>
          {hub?.public_token && (
            <a
              href={hubUrl(hub.public_token)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              預覽客戶頁
            </a>
          )}
          {hub && (
            <button
              type="button"
              disabled={busy}
              onClick={regenerateToken}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              重設連結
            </button>
          )}
        </div>
      </div>

      <label className="block text-xs font-medium text-gray-600 mb-1">歡迎訊息（選填）</label>
      <textarea
        value={welcome}
        onChange={(e) => setWelcome(e.target.value)}
        rows={2}
        placeholder={`您好，這是「${projectName || '專案'}」的協作頁面…`}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:border-gray-400"
      />
      <button
        type="button"
        disabled={busy}
        onClick={saveWelcome}
        className="text-xs font-semibold hover:opacity-80 mb-4"
        style={{ color: accent }}
      >
        儲存歡迎訊息
      </button>

      <div className="border-t border-gray-100 pt-3 mb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <div>
            <h3 className="text-xs font-semibold text-gray-800">本專案報價方案</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              僅列出此專案的報價；公開後客戶頁可左右滑動比較多份方案。
            </p>
          </div>
          {quotations.length > 0 && (
            <span className="text-[11px] font-medium text-gray-500">
              {publishedCount} / {quotations.length} 已公開
            </span>
          )}
        </div>
        {quotations.length === 0 ? (
          <p className="text-xs text-gray-400">
            此專案尚無報價單。請在專案內建立報價後，再回到此處公開給客戶。
          </p>
        ) : (
          <div
            ref={quoteScrollerRef}
            className="hub-quote-scroller flex gap-2.5 overflow-x-auto pb-2 -mx-0.5 px-0.5 snap-x snap-mandatory items-stretch cursor-grab"
          >
            {quotations.map((q) => {
              const title = q.title || '未命名方案';
              const statusLabel = QUOTE_STATUS_LABEL[q.status] || q.status;
              return (
                <div
                  key={q.id}
                  className="flex flex-col text-sm bg-white rounded-lg px-3 py-2.5 border border-gray-100 shrink-0 snap-start min-w-[14.5rem] max-w-[17rem] flex-[0_0_14.5rem] min-h-[8.75rem]"
                  style={{ borderLeftWidth: 3, borderLeftColor: accent }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate min-h-[1.25rem]">{title}</p>
                    <p className="text-[11px] font-mono text-gray-500 mt-0.5 truncate">
                      {q.quote_number}
                    </p>
                    {q.total != null && (
                      <p className="text-[11px] text-gray-600 mt-0.5 tabular-nums">
                        {fmtCurrency(q.total, q.currency)}
                      </p>
                    )}
                    <p className="min-h-[1.35rem] mt-1">
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">
                        {statusLabel}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => togglePublish(q)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md w-full mt-auto shrink-0 ${
                      q.client_visible
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {q.client_visible ? '已公開' : '公開給客戶'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <Link
          href={`/quotations?project_id=${projectId}`}
          className="inline-block mt-2 text-[11px] font-medium hover:opacity-80"
          style={{ color: accent }}
        >
          在報價單管理此專案 →
        </Link>
      </div>

      <div className="border-t border-gray-100 pt-3">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">審稿／外部連結</h3>
        {(hub?.links || []).map((lnk) => (
          <div
            key={lnk.id}
            className="flex items-center justify-between gap-2 text-xs mb-1.5 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100"
          >
            <a
              href={lnk.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:opacity-80"
              style={{ color: accent }}
            >
              {lnk.label}
            </a>
            <button
              type="button"
              onClick={() => removeLink(lnk.id)}
              className="text-gray-400 hover:text-red-500 shrink-0"
            >
              刪除
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 mt-2">
          <input
            value={linkForm.label}
            onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="標籤，例：審稿 v3"
            className="flex-1 min-w-[120px] text-xs border border-gray-200 rounded-lg px-2 py-1.5"
          />
          <input
            value={linkForm.url}
            onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://…"
            className="flex-[2] min-w-[160px] text-xs border border-gray-200 rounded-lg px-2 py-1.5"
          />
          <button
            type="button"
            disabled={busy}
            onClick={addLink}
            className="text-xs font-semibold hover:opacity-80"
            style={{ color: accent }}
          >
            新增
          </button>
        </div>
      </div>
    </section>
  );
}
