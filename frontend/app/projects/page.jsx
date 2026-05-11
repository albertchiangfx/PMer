'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { fmtCurrency, statusStyle, fmt } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';
import { MILESTONE_TEMPLATE_OPTIONS } from '../../lib/milestone-templates';

const STATUS_OPTS = ['planning', 'active', 'completed', 'paused', 'cancelled'];
const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | {project}
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(defaultForm());

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

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([api.getProjects(), api.getClients()]);
    setProjects(p); setClients(c);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const openCreate = () => { setForm(defaultForm()); setModal('create'); };
  const openEdit = (p) => { setForm({ ...p, budget: p.budget || '', client_id: p.client_id || '' }); setModal(p); };

  const save = async (e) => {
    e.preventDefault();
    const data = { ...form, budget: form.budget || null, client_id: form.client_id || null };
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
    load();
  };

  const del = async (p) => {
    if (!confirm(`刪除「${p.name}」？此操作無法撤銷。`)) return;
    await api.deleteProject(p.id);
    load();
  };

  const filtered = projects.filter(p =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.client_name?.toLowerCase().includes(filter.toLowerCase())
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
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors">
          <span>＋</span> 新增專案
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="搜尋專案或客戶..."
          className="w-full max-w-sm bg-white border border-gray-200 rounded-apple px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-apple-sm" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map(p => <ProjectRow key={p.id} project={p} onEdit={openEdit} onDelete={del} />)}
          {filtered.length === 0 && (
            <div className="bg-white rounded-apple-lg shadow-apple p-16 text-center">
              <p className="text-gray-400 text-sm">尚無符合條件的專案</p>
              <button onClick={openCreate} className="mt-4 text-indigo-600 text-sm font-medium hover:text-indigo-700">+ 建立第一個專案</button>
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
                <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
              </div>
              <div>
                <Label>客戶</Label>
                <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">無客戶</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>狀態</Label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>開始日期</Label>
                <Input type="date" value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} />
              </div>
              <div>
                <Label>結束日期</Label>
                <Input type="date" value={form.end_date} onChange={v => setForm(f => ({ ...f, end_date: v }))} />
              </div>
              <div>
                <Label>預算</Label>
                <Input type="number" value={form.budget} onChange={v => setForm(f => ({ ...f, budget: v }))} placeholder="0.00" />
              </div>
              <div>
                <Label>顏色</Label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }} />
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
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple transition-colors">
                {modal === 'create' ? '建立專案' : '儲存變更'}
              </button>
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium">取消</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ProjectRow({ project, onEdit, onDelete }) {
  const s = statusStyle(project.status);
  return (
    <div className="bg-white rounded-apple-lg shadow-apple p-5 flex items-center gap-5 hover:shadow-apple-lg transition-all duration-200 group">
      <div className="w-3 h-12 rounded-full shrink-0" style={{ backgroundColor: project.color || '#6366f1' }} />
      <div className="flex-1 min-w-0">
        <Link href={`/projects/${project.id}`} className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
          {project.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          <p className="text-xs text-gray-400">{project.client_name || '無客戶'}</p>
          <Link href={`/projects/${project.id}/schedule`} className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600">
            專案時程甘特
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-400">時程</p>
          <p className="text-xs font-medium text-gray-600">{project.start_date ? `${fmt(project.start_date)} — ${fmt(project.end_date)}` : '未設定'}</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs text-gray-400">預算</p>
          <p className="text-sm font-semibold text-gray-900">{project.budget ? fmtCurrency(project.budget) : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">任務</p>
          <p className="text-sm font-semibold text-gray-900">{project.task_count || 0}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {project.status}
        </span>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(project)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">編輯</button>
          <button onClick={() => onDelete(project)} className="text-xs text-red-500 hover:text-red-600 font-medium">刪除</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Label({ children }) { return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>; }
function Input({ type = 'text', value, onChange, required, placeholder }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />;
}
