'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import ModalPortal from './ModalPortal';

/**
 * 報價單預覽 + 下載 PDF。
 * 只有一個樣板，不需選樣板；直接 iframe 預覽 + 一鍵下載。
 */
export default function QuotationPreviewModal({ open, quotation, onClose, onGenerated }) {
  const [previewHtml, setPreviewHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');
  const [iframeHeight, setIframeHeight] = useState(900);
  const iframeRef = useRef(null);

  const fitIframe = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const h = Math.max(
        doc.body?.scrollHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        doc.body?.offsetHeight || 0,
        doc.documentElement?.offsetHeight || 0,
      );
      if (h > 0) setIframeHeight(h + 24);
    } catch {
      // cross-origin / not ready — ignore
    }
  };

  useEffect(() => {
    if (!previewHtml) return;
    const t1 = setTimeout(fitIframe, 80);
    const t2 = setTimeout(fitIframe, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [previewHtml]);

  useEffect(() => {
    if (!open || !quotation?.id) return;
    let cancelled = false;
    setBusy(true);
    setErr('');
    fetch(api.previewQuotationHtmlUrl(quotation.id), { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(j.error || '預覽失敗');
        }
        return r.text();
      })
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, quotation?.id]);

  if (!open) return null;

  const generatePdf = async () => {
    setGenerating(true);
    setErr('');
    try {
      const res = await fetch(api.generateQuotationPdfUrl(quotation.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || '產生 PDF 失敗');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation-${quotation.quote_number || quotation.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onGenerated?.();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 overflow-y-auto modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="min-h-full w-full flex justify-center px-4 py-6"
        onClick={(e) => e.target === e.currentTarget && onClose?.()}
      >
        <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-5xl animate-slide-up flex flex-col self-start">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white rounded-t-apple-xl">
          <div>
            <h2 className="text-base font-semibold text-slate-900">報價單預覽</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {quotation?.quote_number}
              {quotation?.project_name ? ` · ${quotation.project_name}` : ''}
              {quotation?.client_name ? ` · ${quotation.client_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {quotation?.pdf_path ? (
              <a
                href={quotation.pdf_path}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                開啟舊 PDF
              </a>
            ) : null}
            <button
              type="button"
              onClick={generatePdf}
              disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-apple"
            >
              {generating ? '產生中…' : '產生並下載 PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
            >
              ✕
            </button>
          </div>
        </div>

        {err ? (
          <div className="px-6 py-2 text-xs text-rose-600 bg-rose-50 border-b border-rose-200">
            {err}
          </div>
        ) : null}

        <section className="bg-slate-50 rounded-b-apple-xl">
          {busy ? (
            <div className="h-[60vh] flex items-center justify-center text-sm text-slate-400">
              載入預覽…
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="quotation-preview"
              srcDoc={previewHtml}
              onLoad={fitIframe}
              style={{ height: iframeHeight }}
              className="w-full bg-white rounded-b-apple-xl block border-0"
            />
          )}
        </section>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
