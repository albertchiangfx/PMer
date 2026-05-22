'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { notifyScheduleDataChanged } from '../lib/dashboard-sync';
import { validateIntervalWithinProject } from '../lib/projectScheduleBounds';

const TASK_TYPES = [
  'general',
  'modeling',
  'rigging',
  'animation',
  'rendering',
  'compositing',
  'vfx',
  'audio',
  'review',
];
const PRIORITIES = ['low', 'medium', 'high'];
const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'];

function sliceYmd(d) {
  if (d == null || d === '') return '';
  return String(d).slice(0, 10);
}

function defaultForm(project) {
  return {
    name: '',
    description: '',
    task_type: 'general',
    status: 'todo',
    priority: 'medium',
    start_date: sliceYmd(project?.start_date),
    end_date: sliceYmd(project?.end_date),
    team_member_id: '',
  };
}

export default function QuickTaskModal({ project, onClose, onCreated }) {
  const [form, setForm] = useState(() => defaultForm(project));
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(defaultForm(project));
    api
      .getTeamMembers({ status: 'active' })
      .then((m) => setMembers(Array.isArray(m) ? m : []))
      .catch(() => setMembers([]));
  }, [project?.id]);

  if (!project?.id) return null;

  const bounds = {
    start: sliceYmd(project.start_date),
    end: sliceYmd(project.end_date),
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('請填寫任務名稱');
      return;
    }
    const memberId = form.team_member_id || '';
    if (memberId && (!form.start_date || !form.end_date)) {
      alert('已指派成員時，請填寫開始／結束日期');
      return;
    }
    if (bounds.start && bounds.end && form.start_date && form.end_date) {
      const v = validateIntervalWithinProject(
        form.start_date,
        form.end_date,
        bounds.start,
        bounds.end
      );
      if (!v.ok) {
        alert(v.message);
        return;
      }
    }
    try {
      setBusy(true);
      const created = await api.createTask({
        name: form.name.trim(),
        description: form.description || undefined,
        task_type: form.task_type,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        project_id: project.id,
      });
      if (memberId && form.start_date && form.end_date) {
        await api.createTimeAllocation({
          task_id: created.id,
          team_member_id: memberId,
          start_date: form.start_date,
          end_date: form.end_date,
          allocated_days: 1,
          allocated_hours: 8,
        });
      }
      notifyScheduleDataChanged();
      onCreated?.(created);
      onClose();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">新增任務</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{project.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">任務名稱 *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">類型</label>
              <select
                value={form.task_type}
                onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">狀態</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm"
              >
                {TASK_STATUSES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">優先級</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm"
              >
                {PRIORITIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">開始日期</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                min={bounds.start || undefined}
                max={bounds.end || undefined}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">結束日期</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                min={bounds.start || undefined}
                max={bounds.end || undefined}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">指派給</label>
            <select
              value={form.team_member_id}
              onChange={(e) => setForm((f) => ({ ...f, team_member_id: e.target.value }))}
              className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm"
            >
              <option value="">未指派</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-apple"
            >
              {busy ? '處理中…' : '建立任務'}
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
