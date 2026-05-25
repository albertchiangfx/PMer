'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * 合約 PDF 產生器：
 *  - 選樣板（radio）
 *  - 勾條款（checkbox）
 *  - 預覽 HTML（iframe srcDoc）
 *  - 產生 PDF（下載 + 自動存到 contracts.file_path）
 */
export default function ContractGeneratorModal({ open, contract, onClose, onGenerated }) {
  const [options, setOptions] = useState({ templates: [], clauses: [] });
  const [templateId, setTemplateId] = useState('');
  const [clauseIds, setClauseIds] = useState([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    api
      .getContractGeneratorOptions()
      .then((opt) => {
        setOptions(opt);
        if (!templateId && opt.templates?.length) setTemplateId(opt.templates[0].id);
      })
      .catch((e) => setErr(e.message || String(e)));
  }, [open]);

  useEffect(() => {
    if (!open || !templateId || !contract?.id) return;
    let cancelled = false;
    setBusy(true);
    setErr('');
    fetch(api.previewContractHtmlUrl(contract.id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, clause_ids: clauseIds }),
    })
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
  }, [open, contract?.id, templateId, clauseIds]);

  if (!open) return null;

  const toggleClause = (id) =>
    setClauseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const generatePdf = async () => {
    setGenerating(true);
    setErr('');
    try {
      const res = await fetch(api.generateContractPdfUrl(contract.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, clause_ids: clauseIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || '產生 PDF 失敗');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${contract.contract_number || contract.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onGenerated?.();
      onClose?.();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-5xl h-[88vh] overflow-hidden animate-slide-up flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">合約 PDF 產生器</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              合約 {contract?.contract_number || ''}
              {contract?.project_name ? ` · ${contract.project_name}` : ''}
              {contract?.client_name ? ` · ${contract.client_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="w-full md:w-[18rem] shrink-0 border-r border-gray-100 overflow-y-auto p-5 space-y-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                樣板
              </h3>
              <div className="space-y-1.5">
                {options.templates.map((t) => (
                  <label
                    key={t.id}
                    className={`block px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                      templateId === t.id
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="template"
                        value={t.id}
                        checked={templateId === t.id}
                        onChange={() => setTemplateId(t.id)}
                        className="accent-indigo-600"
                      />
                      <span className="font-semibold">{t.name}</span>
                      <span className="ml-auto text-[10px] text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        {t.currency}
                      </span>
                    </div>
                    {t.description ? (
                      <p className="text-xs text-slate-500 mt-1 ml-5">{t.description}</p>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                條款片段
              </h3>
              <div className="space-y-1.5">
                {options.clauses.map((c) => {
                  const checked = clauseIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`block px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                        checked
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClause(c.id)}
                          className="accent-emerald-600"
                        />
                        <span className="font-semibold">{c.name}</span>
                      </div>
                      {c.description ? (
                        <p className="text-xs text-slate-500 mt-1 ml-6">{c.description}</p>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>

            {err ? (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
                {err}
              </div>
            ) : null}

            <button
              type="button"
              onClick={generatePdf}
              disabled={generating || !templateId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-apple"
            >
              {generating ? '產生中…' : '產生 PDF 並下載'}
            </button>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              產生後會自動下載，並把檔案路徑存到合約紀錄的「檔案」欄位。
            </p>
          </aside>

          <section className="flex-1 min-w-0 bg-slate-50 flex flex-col">
            <div className="px-4 py-2 text-xs text-slate-500 border-b border-gray-100 bg-white">
              預覽（會與最終 PDF 接近，但細部排版以 PDF 為準）
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {busy ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  載入預覽…
                </div>
              ) : (
                <iframe
                  title="contract-preview"
                  srcDoc={previewHtml}
                  className="w-full h-full bg-white"
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
