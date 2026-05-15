'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import useSWR from 'swr';
import { api } from '../../lib/api';
import { fmtCurrency, statusStyle, fmt } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';
import { MILESTONE_TEMPLATE_OPTIONS } from '../../lib/milestone-templates';
import {
  MILESTONE_DATA_CHANGED_EVENT,
  notifyMilestoneDataChanged,
  notifyScheduleDataChanged,
} from '../../lib/dashboard-sync';

const STATUS_OPTS = ['planning', 'active', 'completed', 'paused', 'cancelled'];
const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#14b8a6',
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | {project}
  const [clientsManageOpen, setClientsManageOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(defaultForm());
  const [loadError, setLoadError] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);

  function defaultForm() {
    return {
      name: '',
      client_id: '',
      description: '',
      budget: '',
      status: 'planning',
      start_date: '',
      end_date: '',
      color: '#6366f1',
      milestone_template: '',
    };
  }

  const projectIds = useMemo(() => projects.map((p) => p.id).filter(Boolean), [projects]);
  const idsSortedKey = projectIds.length ? [...projectIds].sort().join('|') : null;
  const { data: msSummary = {}, mutate: mutateMsSum } = useSWR(
    idsSortedKey ? ['projects-page', 'ms-sum', idsSortedKey] : null,
    () => api.getMilestoneSummaryByProjects(projectIds)
  );
  const { data: msLists = {}, mutate: mutateMsLists } = useSWR(
    idsSortedKey ? ['projects-page', 'ms-lists', idsSortedKey] : null,
    () => api.getProjectMilestonesByProjects(projectIds)
  );

  useEffect(() => {
    const fn = () => {
      mutateMsSum(undefined, { revalidate: true });
      mutateMsLists(undefined, { revalidate: true });
    };
    window.addEventListener(MILESTONE_DATA_CHANGED_EVENT, fn);
    return () => window.removeEventListener(MILESTONE_DATA_CHANGED_EVENT, fn);
  }, [mutateMsSum, mutateMsLists]);

  const summaryByLc = useMemo(() => {
    const o = {};
    for (const [k, v] of Object.entries(msSummary)) o[String(k).toLowerCase()] = v;
    return o;
  }, [msSummary]);
  const listsByLc = useMemo(() => {
    const o = {};
    for (const [k, v] of Object.entries(msLists))
      o[String(k).toLowerCase()] = Array.isArray(v) ? v : [];
    return o;
  }, [msLists]);

  const refreshMilestones = useCallback(async () => {
    await Promise.all([
      mutateMsSum(undefined, { revalidate: true }),
      mutateMsLists(undefined, { revalidate: true }),
    ]);
  }, [mutateMsSum, mutateMsLists]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [p, c] = await Promise.all([api.getProjects(), api.getClients()]);
      setProjects(Array.isArray(p) ? p : []);
      setClients(Array.isArray(c) ? c : []);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || '無法載入專案或客戶資料');
      setProjects([]);
      setClients([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const openCreate = () => {
    setForm(defaultForm());
    setModal('create');
  };
  const openEdit = (p) => {
    setForm({ ...p, budget: p.budget || '', client_id: p.client_id || '' });
    setModal(p);
  };

  const save = async (e) => {
    e.preventDefault();
    const data = { ...form, budget: form.budget || null, client_id: form.client_id || null };
    try {
      setSaveBusy(true);
      if (modal === 'create') {
        const created = await api.createProject(data);
        if (form.milestone_template) {
          try {
            await api.bootstrapProjectMilestones({
              project_id: created.id,
              template: form.milestone_template,
            });
          } catch (err) {
            console.error(err);
          }
        }
      } else await api.updateProject(modal.id, data);
      setModal(null);
      await load();
      notifyScheduleDataChanged();
    } catch (err) {
      console.error(err);
      alert(err?.message || String(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const del = async (p) => {
    if (!confirm(`刪除「${p.name}」？此操作無法撤銷。`)) return;
    await api.deleteProject(p.id);
    load();
  };

  const filtered = projects.filter(
    (p) =>
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <BackToDashboard className="mb-4" />
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">專案</h1>
          <p className="text-gray-400 mt-1 text-sm">{projects.length} 個專案</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
        >
          <span>＋</span> 新增專案
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-apple-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0">{loadError}</span>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setLoading(true);
                await load();
                setLoading(false);
              })();
            }}
            className="shrink-0 px-3 py-1.5 rounded-apple bg-white border border-rose-200 text-rose-900 font-medium text-xs hover:bg-rose-100"
          >
            重試
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜尋專案或客戶..."
          className="w-full max-w-sm bg-white border border-gray-200 rounded-apple px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-apple-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((p) => {
            const idLc = String(p.id).toLowerCase();
            return (
              <ProjectRow
                key={p.id}
                project={p}
                onEdit={openEdit}
                onDelete={del}
                milestoneSummary={summaryByLc[idLc]}
                milestones={listsByLc[idLc] || []}
                onMilestonesChanged={refreshMilestones}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-apple-lg shadow-apple p-16 text-center">
              <p className="text-gray-400 text-sm">尚無符合條件的專案</p>
              <button
                onClick={openCreate}
                className="mt-4 text-indigo-600 text-sm font-medium hover:text-indigo-700"
              >
                + 建立第一個專案
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal === 'create' ? '新增專案' : '編輯專案'} onClose={() => setModal(null)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>專案名稱 *</Label>
                <Input
                  value={form.name}
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                  required
                />
              </div>
              <div>
                <Label>客戶</Label>
                <div className="flex gap-2">
                  <select
                    value={form.client_id}
                    onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                    className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">無客戶</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setClientsManageOpen(true)}
                    className="shrink-0 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-apple hover:bg-indigo-100 transition-colors whitespace-nowrap"
                  >
                    管理客戶
                  </button>
                </div>
              </div>
              <div>
                <Label>狀態</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>開始日期</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
                />
              </div>
              <div>
                <Label>結束日期</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(v) => setForm((f) => ({ ...f, end_date: v }))}
                />
              </div>
              <div>
                <Label>預算</Label>
                <Input
                  type="number"
                  value={form.budget}
                  onChange={(v) => setForm((f) => ({ ...f, budget: v }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>顏色</Label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              {modal === 'create' && (
                <div className="col-span-2">
                  <Label>里程碑公版（選用）</Label>
                  <select
                    value={form.milestone_template || ''}
                    onChange={(e) => setForm((f) => ({ ...f, milestone_template: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">建立後自行設定</option>
                    {MILESTONE_TEMPLATE_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <Label>描述</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saveBusy}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-apple transition-colors"
              >
                {saveBusy ? '處理中…' : modal === 'create' ? '建立專案' : '儲存變更'}
              </button>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                取消
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ClientsManageModal
        open={clientsManageOpen}
        onClose={() => setClientsManageOpen(false)}
        onSaved={load}
      />
    </div>
  );
}

function ClientsManageModal({ open, onClose, onSaved }) {
  const [mounted, setMounted] = useState(false);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', contact_email: '', contact_phone: '', address: '' });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSaving(false);
      return;
    }
    let cancelled = false;
    api
      .getClients()
      .then((rows) => {
        if (!cancelled) setList(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        console.error(e);
        alert(e.message || '無法載入客戶列表');
      });
    setForm({ name: '', contact_email: '', contact_phone: '', address: '' });
    setEditingId(null);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const submitSaveClient = async () => {
    if (!form.name.trim()) {
      alert('請填寫客戶名稱');
      return;
    }
    try {
      setSaving(true);
      if (editingId) await api.updateClient(editingId, form);
      else await api.createClient(form);
      const rows = await api.getClients();
      setList(Array.isArray(rows) ? rows : []);
      setForm({ name: '', contact_email: '', contact_phone: '', address: '' });
      setEditingId(null);
      onSaved();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '',
      contact_email: c.contact_email || '',
      contact_phone: c.contact_phone || '',
      address: c.address || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: '', contact_email: '', contact_phone: '', address: '' });
  };

  const del = async (c) => {
    if (
      !confirm(
        `刪除客戶「${c.name}」？\n已連結的專案會改為「無客戶」。若仍有合約綁定此客戶，將無法刪除。`
      )
    )
      return;
    try {
      await api.deleteClient(c.id);
      const rows = await api.getClients();
      setList(Array.isArray(rows) ? rows : []);
      if (editingId === c.id) cancelEdit();
      onSaved();
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <Modal title="管理客戶" onClose={onClose} zClass="z-[100]">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void submitSaveClient();
        }}
        className="space-y-4"
        noValidate
      >
        <p className="text-xs text-gray-500">
          {editingId ? '編輯後按「儲存客戶」。' : '新增後會出現在下方列表與專案表單的下拉選單。'}
        </p>
        <div>
          <Label>名稱 *</Label>
          <Input
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="公司／客戶名稱"
          />
        </div>
        <div>
          <Label>聯絡信箱</Label>
          <Input
            type="text"
            value={form.contact_email}
            onChange={(v) => setForm((f) => ({ ...f, contact_email: v }))}
            placeholder="name@company.com"
          />
        </div>
        <div>
          <Label>電話</Label>
          <Input
            value={form.contact_phone}
            onChange={(v) => setForm((f) => ({ ...f, contact_phone: v }))}
          />
        </div>
        <div>
          <Label>地址</Label>
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            rows={2}
            className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitSaveClient()}
            className="flex-1 min-w-[120px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-apple"
          >
            {saving ? '儲存中…' : editingId ? '儲存客戶' : '新增客戶'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-apple hover:bg-gray-50"
            >
              取消編輯
            </button>
          )}
        </div>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-500 mb-3">現有客戶 ({list.length})</p>
        <ul className="space-y-2 max-h-52 overflow-y-auto">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{c.name}</p>
                {c.contact_email && (
                  <p className="text-xs text-gray-500 truncate">{c.contact_email}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={() => del(c)}
                  className="text-xs text-rose-600 hover:underline font-medium"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
          {list.length === 0 && (
            <li className="text-xs text-gray-400 py-2">尚無客戶，請於上方新增。</li>
          )}
        </ul>
      </div>
    </Modal>,
    document.body
  );
}

function ProjectRow({
  project,
  onEdit,
  onDelete,
  milestoneSummary,
  milestones = [],
  onMilestonesChanged,
}) {
  const s = statusStyle(project.status);
  const [msBusyId, setMsBusyId] = useState(null);
  const empty = !milestoneSummary || !milestoneSummary.total;
  const pct = empty ? 0 : Math.round((milestoneSummary.completed / milestoneSummary.total) * 100);
  const sortedMs = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [milestones]);

  const toggleMilestone = async (ms) => {
    try {
      setMsBusyId(ms.id);
      await api.updateProjectMilestone(ms.id, { completed: !ms.completed });
      await onMilestonesChanged?.();
      notifyMilestoneDataChanged();
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setMsBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-apple-lg shadow-apple p-5 flex flex-col gap-4 hover:shadow-apple-lg duration-200 group">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div
            className="w-3 h-12 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: project.color || '#6366f1' }}
          />
          <div className="flex-1 min-w-0">
            <Link
              href={`/projects/${project.id}`}
              className="text-base font-semibold text-gray-900 hover:text-indigo-600"
            >
              {project.name}
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
              <p className="text-xs text-gray-400">{project.client_name || '無客戶'}</p>
              <Link
                href={`/projects/${project.id}/schedule`}
                className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600"
              >
                專案時程甘特
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 sm:gap-6 text-sm shrink-0">
          <div className="text-right hidden sm:block min-w-[7rem]">
            <p className="text-xs text-gray-400">時程</p>
            <p className="text-xs font-medium text-gray-600">
              {project.start_date
                ? `${fmt(project.start_date)} — ${fmt(project.end_date)}`
                : '未設定'}
            </p>
          </div>
          <div className="text-right hidden md:block min-w-[4.5rem]">
            <p className="text-xs text-gray-400">預算</p>
            <p className="text-sm font-semibold text-gray-900">
              {project.budget ? fmtCurrency(project.budget) : '—'}
            </p>
          </div>
          <div className="text-right min-w-[2.5rem]">
            <p className="text-xs text-gray-400">任務</p>
            <p className="text-sm font-semibold text-gray-900">{project.task_count || 0}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {project.status}
          </span>
          <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onEdit(project)}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => onDelete(project)}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              刪除
            </button>
          </div>
        </div>
      </div>

      <div className="w-full pt-3 border-t border-gray-100">
        <div className="relative h-6 w-full flex items-center">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: empty ? '4%' : `${pct}%`,
                backgroundColor: project.color || '#6366f1',
                opacity: 0.9,
              }}
            />
          </div>
        </div>
        {sortedMs.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1.5 items-center">
            {sortedMs.map((ms) => (
              <label
                key={ms.id}
                className={`inline-flex items-center gap-1.5 max-w-full rounded-full border px-2 py-0.5 text-[10px] leading-tight cursor-pointer select-none ${
                  ms.completed
                    ? 'border-gray-200 bg-gray-50 text-gray-400'
                    : 'border-indigo-200 bg-white text-gray-800 shadow-sm'
                } ${msBusyId === ms.id ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={!!ms.completed}
                  disabled={!!msBusyId}
                  onChange={() => toggleMilestone(ms)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  aria-label={`里程碑 ${ms.label}`}
                />
                <span className={`truncate ${ms.completed ? 'line-through' : 'font-medium'}`}>
                  {ms.label}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-gray-400">
            尚未設定里程碑 ·{' '}
            <Link
              href={`/projects/${project.id}#milestones`}
              className="text-indigo-600 hover:underline font-medium"
            >
              至專案設定
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, zClass = 'z-50' }) {
  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center p-4 modal-backdrop animate-fade-in`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Label({ children }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>;
}
function Input({ type = 'text', value, onChange, required, placeholder }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}
