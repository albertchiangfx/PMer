'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { fmtCurrency } from '../../../lib/utils';
import BackToDashboard from '../../../components/BackToDashboard';
import {
  cardClass,
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollClass,
} from '../../../lib/page-layout';

const inp =
  'w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-500';

function emptyForm() {
  return {
    section_label: '',
    name: '',
    description: '',
    default_unit_price: 0,
    currency: 'TWD',
    sort_order: 0,
    is_active: true,
  };
}

export default function ServiceCatalogPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const list = await api.getQuotationServices();
    setServices(list || []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const startCreate = () => {
    setEditingId('new');
    setForm(emptyForm());
  };

  const startEdit = (svc) => {
    setEditingId(svc.id);
    setForm({
      section_label: svc.section_label || '',
      name: svc.name || '',
      description: svc.description || '',
      default_unit_price: Number(svc.default_unit_price || 0),
      currency: svc.currency || 'TWD',
      sort_order: Number(svc.sort_order || 0),
      is_active: svc.is_active !== false,
    });
  };

  const cancel = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert('請填寫項目名稱');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        default_unit_price: Number(form.default_unit_price || 0),
        sort_order: Number(form.sort_order || 0),
      };
      if (editingId === 'new') await api.createQuotationService(payload);
      else await api.updateQuotationService(editingId, payload);
      await load();
      cancel();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async (svc) => {
    if (!confirm(`刪除服務項目「${svc.name}」？\n（已使用此項目的報價單會保留品項，但失去連結）`)) return;
    try {
      await api.deleteQuotationService(svc.id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const toggleActive = async (svc) => {
    try {
      await api.updateQuotationService(svc.id, { is_active: !svc.is_active });
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return services;
    return services.filter((s) =>
      [s.section_label, s.name, s.description].filter(Boolean).some((v) =>
        String(v).toLowerCase().includes(f)
      )
    );
  }, [services, filter]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const s of filtered) {
      const key = s.section_label || '其他';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
        <BackToDashboard className="mb-2 md:mb-4" />
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-gray-400">
              <Link href="/settings" className="hover:text-indigo-600">
                設定
              </Link>{' '}
              ／ 服務項目庫
            </div>
            <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">服務項目庫</h1>
            <p className="text-gray-400 mt-1 text-xs md:text-sm">
              共 {services.length} 項；出報價單時可勾選並沿用預設單價。
            </p>
          </div>
          <button
            onClick={startCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm"
          >
            ＋ 新增項目
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜尋項目..."
            className="h-9 flex-1 min-w-[180px] max-w-md bg-white border border-gray-200 rounded-lg shadow-apple-sm px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className={pageFrameScrollClass}>
        {editingId ? (
          <div className={`${cardClass} mb-4`}>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              {editingId === 'new' ? '新增服務項目' : '編輯服務項目'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>分區（Section）</Label>
                <input
                  value={form.section_label}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, section_label: e.target.value }))
                  }
                  placeholder="例：創意 / 美術 / 動畫 / 音樂"
                  className={inp}
                />
              </div>
              <div className="md:col-span-2">
                <Label>項目名稱 *</Label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inp}
                />
              </div>
              <div className="md:col-span-3">
                <Label>說明（可多行）</Label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={2}
                  className={inp}
                />
              </div>
              <div>
                <Label>預設單價</Label>
                <input
                  type="number"
                  value={form.default_unit_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, default_unit_price: e.target.value }))
                  }
                  className={inp}
                />
              </div>
              <div>
                <Label>幣別</Label>
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
                <Label>排序</Label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  className={inp}
                />
              </div>
              <label className="md:col-span-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                啟用（不啟用的項目不會出現在報價單對話框）
              </label>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={cancel}
                className="px-4 py-2 text-sm text-gray-500"
              >
                取消
              </button>
              <div className="flex-1" />
              <button
                onClick={save}
                disabled={busy}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-apple"
              >
                {busy ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <Spinner />
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            目前沒有服務項目，按「＋ 新增項目」開始建立。
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([section, list]) => (
              <div key={section} className={cardClass}>
                <div className="text-xs font-semibold text-gray-500 mb-2">{section}</div>
                <div className="divide-y divide-gray-100">
                  {list.map((s) => (
                    <div
                      key={s.id}
                      className="py-2 flex items-center gap-3 group hover:bg-gray-50/60 rounded-md px-2 -mx-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              s.is_active ? 'text-gray-900' : 'text-gray-400 line-through'
                            }`}
                          >
                            {s.name}
                          </span>
                          {!s.is_active ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              停用
                            </span>
                          ) : null}
                        </div>
                        {s.description ? (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {s.description}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs tabular-nums text-gray-700 font-semibold shrink-0">
                        {fmtCurrency(s.default_unit_price, s.currency || 'TWD')}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => toggleActive(s)}
                          className="text-xs text-slate-600 hover:text-slate-900"
                        >
                          {s.is_active ? '停用' : '啟用'}
                        </button>
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => del(s)}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-[10px] font-medium text-gray-500 mb-1">{children}</label>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
