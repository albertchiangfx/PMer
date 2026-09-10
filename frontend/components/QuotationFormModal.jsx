'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { fmtCurrency } from '../lib/utils';
import ModalPortal from './ModalPortal';

const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
const QUOTE_STATUS_LABEL = {
  draft: '草稿',
  sent: '已寄出',
  accepted: '已接受',
  rejected: '已拒絕',
  expired: '已過期',
};

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDaysIso(base, days) {
  if (!base) return '';
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDay(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.split('T')[0];
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return '';
}

function num(v, fallback = 0) {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function makeItem(overrides = {}) {
  return {
    service_id: null,
    section_label: '',
    name: '',
    description: '',
    qty: 1,
    unit_price: 0,
    custom: false,
    ...overrides,
  };
}

function itemsFromInitial(initial) {
  if (!initial?.items?.length) return [];
  return initial.items.map((it) => ({
    service_id: it.service_id || null,
    section_label: it.section_label || '',
    name: it.name || '',
    description: it.description || '',
    qty: Number(it.qty || 1),
    unit_price: Number(it.unit_price || 0),
    custom: !it.service_id,
  }));
}

function buildDefaultForm(initial, defaults) {
  const issued = isoDay(initial?.issued_date) || isoDay(defaults?.issued_date) || todayIso();
  const valid =
    isoDay(initial?.valid_until) ||
    isoDay(defaults?.valid_until) ||
    addDaysIso(issued, 30);
  return {
    project_id: initial?.project_id || defaults?.project_id || '',
    client_id: initial?.client_id || defaults?.client_id || '',
    quote_number: initial?.quote_number || '',
    title: initial?.title || defaults?.title || '',
    status: initial?.status || 'draft',
    currency: initial?.currency || defaults?.currency || 'TWD',
    issued_date: issued,
    valid_until: valid,
    tax_rate: initial?.tax_rate != null ? Number(initial.tax_rate) : 0.05,
    notes: initial?.notes || defaults?.notes || '',
  };
}

export default function QuotationFormModal({
  open,
  mode = 'create',
  initial = null,
  defaults = {},
  projects = [],
  clients = [],
  lockProject = false,
  lockClient = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => buildDefaultForm(initial, defaults));
  const [items, setItems] = useState(() => itemsFromInitial(initial));
  const [services, setServices] = useState([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildDefaultForm(initial, defaults));
    setItems(itemsFromInitial(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    initial?.id,
    defaults?.project_id,
    defaults?.client_id,
    defaults?.currency,
    defaults?.issued_date,
    defaults?.valid_until,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.getQuotationServices({ active: 'true' });
        if (!cancelled) {
          setServices(Array.isArray(list) ? list : []);
          setServicesLoaded(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setServices([]);
          setServicesLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const it of items) {
      subtotal += round2(num(it.qty, 0) * num(it.unit_price, 0));
    }
    subtotal = round2(subtotal);
    const taxRate = num(form.tax_rate, 0);
    const tax = round2(subtotal * taxRate);
    const total = round2(subtotal + tax);
    return { subtotal, tax, total };
  }, [items, form.tax_rate]);

  // 由 service_id 構建已選 map，方便 checkbox 渲染
  const selectedServiceIds = useMemo(() => {
    const s = new Set();
    for (const it of items) {
      if (it.service_id) s.add(String(it.service_id));
    }
    return s;
  }, [items]);

  const toggleService = (svc) => {
    setItems((arr) => {
      const removeAt = arr.findIndex((it) => it.service_id === svc.id);
      if (removeAt >= 0) {
        const next = [...arr];
        next.splice(removeAt, 1);
        return next;
      }
      // 插入到「目錄預設順序」的對應位置：
      // 服務品項依 services 陣列順序排，自訂列維持在最後。
      const catalogIndex = (sid) =>
        services.findIndex((s) => String(s.id) === String(sid));
      const newSvcIdx = catalogIndex(svc.id);
      const newItem = makeItem({
        service_id: svc.id,
        section_label: svc.section_label || '',
        name: svc.name,
        description: svc.description || '',
        qty: 1,
        unit_price: Number(svc.default_unit_price || 0),
      });
      let insertAt = arr.length;
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (!it.service_id) {
          insertAt = i;
          break;
        }
        const otherIdx = catalogIndex(it.service_id);
        if (otherIdx > newSvcIdx) {
          insertAt = i;
          break;
        }
      }
      const next = [...arr];
      next.splice(insertAt, 0, newItem);
      return next;
    });
  };

  const updateItem = (idx, patch) => {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx) => {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  };

  const addCustomItem = () => {
    setItems((arr) => [
      ...arr,
      makeItem({ custom: true, section_label: '其他', name: '', qty: 1, unit_price: 0 }),
    ]);
  };

  const moveItem = (idx, dir) => {
    setItems((arr) => {
      const next = [...arr];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return arr;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const groupedServices = useMemo(() => {
    const groups = new Map();
    for (const s of services) {
      const key = s.section_label || '其他';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    return Array.from(groups.entries()); // [[section, items[]], ...]
  }, [services]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_id) {
      alert('請選擇客戶');
      return;
    }
    if (!items.length) {
      if (!confirm('沒有任何項目，仍要建立空白報價單？')) return;
    }
    setBusy(true);
    try {
      await onSubmit({
        ...form,
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        tax_rate: num(form.tax_rate, 0.05),
        items: items.map((it, i) => ({
          service_id: it.service_id || null,
          section_label: it.section_label || '',
          name: it.name || '',
          description: it.description || '',
          qty: num(it.qty, 1),
          unit_price: num(it.unit_price, 0),
          line_total: round2(num(it.qty, 0) * num(it.unit_price, 0)),
          sort_order: i,
        })),
      });
      onClose?.();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
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
        <div className="surface rounded-apple-xl w-full max-w-5xl animate-slide-up flex flex-col self-start">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white/90 backdrop-blur-md rounded-t-apple-xl">
          <div>
            <p className="v2-eyebrow mb-1">Quotation</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              {mode === 'create' ? '新增報價單' : `編輯報價單 ${initial?.quote_number || ''}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 基本資料 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <L>客戶 *</L>
              <select
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                required
                disabled={lockClient}
                className={inp}
              >
                <option value="">請選擇</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>專案</L>
              <select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                disabled={lockProject}
                className={inp}
              >
                <option value="">（未綁定專案）</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>報價單編號</L>
              <input
                value={form.quote_number}
                onChange={(e) => setForm((f) => ({ ...f, quote_number: e.target.value }))}
                placeholder="留空自動產生"
                className={inp}
              />
            </div>
            <div className="md:col-span-2">
              <L>標題（顯示於 PDF Project 欄位；未填則用專案名）</L>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例：2026 Acer Premium OLED series PV"
                className={inp}
              />
            </div>
            <div>
              <L>狀態</L>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={inp}
              >
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {QUOTE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>開立日</L>
              <input
                type="date"
                value={form.issued_date}
                onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))}
                className={inp}
              />
            </div>
            <div>
              <L>有效期至</L>
              <input
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                className={inp}
              />
            </div>
            <div>
              <L>幣別</L>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className={inp}
              >
                {['TWD', 'USD', 'CNY', 'JPY', 'EUR'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <L>稅率（小數，例 0.05）</L>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.tax_rate}
                onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))}
                className={inp}
              />
            </div>
          </div>

          {/* 服務項目庫 */}
          <div className="border border-gray-200 rounded-apple-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-700">勾選服務項目</div>
              <div className="text-xs text-gray-500">
                共 {services.length} 項可用；勾選後可在下方調整數量／單價
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {!servicesLoaded ? (
                <div className="p-4 text-sm text-gray-500">載入中…</div>
              ) : groupedServices.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  尚無服務項目，請先到「設定 → 服務項目庫」新增。
                </div>
              ) : (
                groupedServices.map(([sect, list]) => (
                  <div key={sect} className="">
                    <div className="px-4 py-1.5 bg-gray-50/60 text-[11px] font-semibold text-gray-500">
                      {sect}
                    </div>
                    {list.map((svc) => {
                      const checked = selectedServiceIds.has(String(svc.id));
                      return (
                        <label
                          key={svc.id}
                          className={`flex items-start gap-3 px-4 py-2 cursor-pointer hover:bg-indigo-50/50 ${
                            checked ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleService(svc)}
                            className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {svc.name}
                            </div>
                            {svc.description ? (
                              <div className="text-xs text-gray-500 truncate">{svc.description}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 tabular-nums shrink-0">
                            預設 {fmtCurrency(svc.default_unit_price, svc.currency || 'TWD')}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 已勾選的品項清單（可改 qty / unit_price / desc，可加自訂） */}
          <div className="border border-slate-200/80 rounded-apple-lg overflow-hidden bg-white/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 bg-white/60">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  報價內容 <span className="text-slate-400 font-normal">({items.length})</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">數量、單價欄位已加寬，金額完整顯示</p>
              </div>
              <button
                type="button"
                onClick={addCustomItem}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0"
              >
                ＋ 加自訂列
              </button>
            </div>
            {items.length === 0 ? (
              <div className="p-5 text-sm text-slate-500 text-center">
                從上方勾選服務，或按「＋ 加自訂列」開始。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[820px]">
                  <div className={`hidden md:grid ${LINE_GRID_MD} gap-x-3 px-4 py-2.5 border-b border-slate-200/70 bg-slate-50/80`}>
                    <LineHead>項目</LineHead>
                    <LineHead>說明</LineHead>
                    <LineHead align="right">數量</LineHead>
                    <LineHead align="right">單價</LineHead>
                    <LineHead align="right">小計</LineHead>
                    <span />
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const lineTotal = round2(num(it.qty, 0) * num(it.unit_price, 0));
                      return (
                        <div
                          key={idx}
                          className={`px-4 py-3.5 grid grid-cols-1 gap-x-3 gap-y-2.5 items-start md:items-center hover:bg-white/70 ${LINE_GRID_MD}`}
                        >
                          <div className="space-y-1.5 min-w-0">
                            <input
                              value={it.section_label}
                              onChange={(e) => updateItem(idx, { section_label: e.target.value })}
                              placeholder="分區"
                              className="w-full max-w-[10rem] bg-slate-100/90 hover:bg-slate-200/60 focus:bg-white focus:ring-1 focus:ring-indigo-300 border-0 rounded-full px-2.5 py-0.5 text-[11px] text-slate-600 focus:outline-none"
                            />
                            <input
                              value={it.name}
                              onChange={(e) => updateItem(idx, { name: e.target.value })}
                              placeholder="項目名稱 *"
                              className={`${inp} h-9 text-[13px] font-medium text-slate-900`}
                            />
                          </div>
                          <div className="min-w-0">
                            <textarea
                              value={it.description}
                              onChange={(e) => updateItem(idx, { description: e.target.value })}
                              placeholder="說明"
                              rows={2}
                              className={`${inp} text-[12px] leading-relaxed resize-y min-h-[2.5rem]`}
                            />
                          </div>
                          <div className="max-md:grid max-md:grid-cols-[4rem_1fr] max-md:gap-2 max-md:items-center">
                            <MobileFieldLabel>數量</MobileFieldLabel>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.qty}
                              onChange={(e) => updateItem(idx, { qty: e.target.value })}
                              className={`${inpNum} w-full`}
                            />
                          </div>
                          <div className="max-md:grid max-md:grid-cols-[4rem_1fr] max-md:gap-2 max-md:items-center">
                            <MobileFieldLabel>單價</MobileFieldLabel>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={it.unit_price}
                              onChange={(e) => updateItem(idx, { unit_price: e.target.value })}
                              className={`${inpNum} w-full`}
                            />
                          </div>
                          <div className="max-md:grid max-md:grid-cols-[4rem_1fr] max-md:gap-2 max-md:items-center">
                            <MobileFieldLabel>小計</MobileFieldLabel>
                            <div className="h-9 flex items-center justify-end px-2.5 rounded-lg bg-slate-50/80 text-[13px] font-semibold tabular-nums text-slate-900">
                              {fmtCurrency(lineTotal, form.currency)}
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1 max-md:pt-1">
                            <LineActionBtn
                              onClick={() => moveItem(idx, -1)}
                              disabled={idx === 0}
                              label="上移"
                            >
                              ↑
                            </LineActionBtn>
                            <LineActionBtn
                              onClick={() => moveItem(idx, 1)}
                              disabled={idx === items.length - 1}
                              label="下移"
                            >
                              ↓
                            </LineActionBtn>
                            <LineActionBtn onClick={() => removeItem(idx)} label="刪除" danger>
                              ✕
                            </LineActionBtn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {items.length > 0 ? (
              <div className="bg-gray-50 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <SummaryCell label="Subtotal" value={fmtCurrency(totals.subtotal, form.currency)} />
                <SummaryCell label="Tax rate" value={`${(num(form.tax_rate, 0) * 100).toFixed(2).replace(/\.00$/, '')}%`} />
                <SummaryCell label="Tax due" value={fmtCurrency(totals.tax, form.currency)} />
                <SummaryCell label="TOTAL" value={fmtCurrency(totals.total, form.currency)} highlight />
              </div>
            ) : null}
          </div>

          {/* 備註 */}
          <div>
            <L>備註（會印在 PDF 上）</L>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="例：本專案提供最多 2 次修改，超出範圍另行報價。"
              className={inp}
            />
          </div>
        </form>

        <div className="sticky bottom-0 z-10 px-6 py-4 border-t border-slate-200/80 flex items-center gap-3 bg-white/95 backdrop-blur-md rounded-b-apple-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500"
          >
            取消
          </button>
          <div className="flex-1" />
          <div className="text-right pr-3 hidden sm:block">
            <div className="text-[10px] text-gray-400">TOTAL</div>
            <div className="text-base font-bold tabular-nums">
              {fmtCurrency(totals.total, form.currency)}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-apple"
          >
            {mode === 'create' ? '建立報價單' : '儲存'}
          </button>
        </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function SummaryCell({ label, value, highlight = false }) {
  return (
    <div className={highlight ? 'rounded-md bg-indigo-50 px-2 py-1' : ''}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div
        className={`tabular-nums font-semibold ${
          highlight ? 'text-indigo-700' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** 桌面報價列：固定數字欄寬，避免單價被擠掉 */
const LINE_GRID_MD =
  'md:[grid-template-columns:minmax(9rem,1.05fr)_minmax(10rem,1.35fr)_3.75rem_7.25rem_6.75rem_4.75rem]';

const inp =
  'w-full min-w-0 bg-white/80 border border-slate-200/90 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500';

const inpNum =
  'h-9 min-h-9 box-border w-full bg-white/90 border border-slate-200/90 rounded-lg px-2.5 py-1 text-right text-[13px] leading-9 tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400';

function L({ children }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">
      {children}
    </label>
  );
}

function LineHead({ children, align = 'left' }) {
  return (
    <div
      className={`text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </div>
  );
}

function MobileFieldLabel({ children }) {
  return (
    <span className="md:hidden text-[11px] font-semibold text-slate-500 tabular-nums">{children}</span>
  );
}

function LineActionBtn({ children, onClick, disabled, label, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-8 h-8 grid place-items-center rounded-lg text-[13px] transition-colors disabled:opacity-30 ${
        danger
          ? 'text-red-500 hover:text-red-700 hover:bg-red-50'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
