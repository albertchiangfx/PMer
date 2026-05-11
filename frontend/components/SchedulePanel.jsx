'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { api } from '../lib/api';
import Gantt from './Gantt';
import StudioProjectsGantt from './StudioProjectsGantt';
import { GANTT_OFFSCREEN_DOT, GANTT_OFFSCREEN_DOT_STORAGE_KEY } from './ganttOffscreenDots';

export default function SchedulePanel({ defaultTab = 'studio', title = '工作時程' }) {
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  /** studio = 全工作室依「專案」列；members = 依「分配／成員」列 */
  const [scheduleTab, setScheduleTab] = useState(defaultTab);
  /** 與甘特共用：依專案／依成員切換時保留同一時間列模式 */
  const [ganttTimelineMode, setGanttTimelineMode] = useState('auto');
  const [offscreenDotHex, setOffscreenDotHex] = useState(GANTT_OFFSCREEN_DOT.backgroundColor);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [allocForm, setAllocForm] = useState(defaultAllocForm());
  const rangeWeeks = 16;

  function defaultAllocForm() {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return {
      project_id: '',
      member_id: '',
      start_date: format(today, 'yyyy-MM-dd'),
      end_date: format(end, 'yyyy-MM-dd'),
      notes: '',
    };
  }

  const load = useCallback(async () => {
    const [m, p, a] = await Promise.all([
      api.getTeamMembers({ status: 'active' }),
      api.getProjects(),
      api.getAllocations(),
    ]);
    setMembers(m);
    setProjects(Array.isArray(p) ? p : []);
    setAllocations(a);
  }, []);

  // Only show the full-page spinner on the very first load. Subsequent
  // refreshes (e.g. after dragging a bar) should silently update data without
  // unmounting the Gantt — otherwise the Gantt would be remounted and lose
  // its internal scroll/zoom state.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GANTT_OFFSCREEN_DOT_STORAGE_KEY);
      if (stored && /^#[0-9a-fA-F]{6}$/.test(stored)) setOffscreenDotHex(stored);
    } catch (_) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [load, version]);

  const refresh = () => setVersion((v) => v + 1);

  const saveAllocation = async (e) => {
    e.preventDefault();
    if (!allocForm.project_id || !allocForm.member_id || !allocForm.start_date || !allocForm.end_date) {
      alert('請選擇專案、成員並填寫開始／結束日期');
      return;
    }
    try {
      await api.createAllocation({
        project_id: allocForm.project_id,
        member_id: allocForm.member_id,
        start_date: allocForm.start_date,
        end_date: allocForm.end_date,
        notes: allocForm.notes || undefined,
      });
      setAllocModalOpen(false);
      setAllocForm(defaultAllocForm());
      refresh();
    } catch (err) {
      if (err.data?.conflicts?.length) {
        alert(`時程衝突：${err.data.conflicts.map((c) => c.project_name || c.task_name || '分配').join('、')}`);
      } else {
        alert(err.message || '建立失敗');
      }
    }
  };

  const conflictCount = (() => {
    const byMember = {};
    for (const a of allocations) {
      const key = `${a.member_id || a.team_member_id}`;
      if (!byMember[key]) byMember[key] = [];
      byMember[key].push(a);
    }
    let count = 0;
    for (const allocs of Object.values(byMember)) {
      for (let i = 0; i < allocs.length; i++) {
        for (let j = i + 1; j < allocs.length; j++) {
          const a = allocs[i], b = allocs[j];
          if (a.start_date <= b.end_date && a.end_date >= b.start_date) count++;
        }
      }
    }
    return count;
  })();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 text-left">{title}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-start lg:justify-end" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setScheduleTab('studio')}
            className={[
              'text-sm font-semibold pb-1 transition-colors border-b-2',
              scheduleTab === 'studio'
                ? 'text-indigo-600 border-indigo-500'
                : 'text-slate-500 border-transparent hover:text-slate-700',
            ].join(' ')}
          >
            依專案
          </button>
          <button
            type="button"
            onClick={() => setScheduleTab('members')}
            className={[
              'text-sm font-semibold pb-1 transition-colors border-b-2',
              scheduleTab === 'members'
                ? 'text-indigo-600 border-indigo-500'
                : 'text-slate-500 border-transparent hover:text-slate-700',
            ].join(' ')}
          >
            依成員
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="flex shrink-0 items-center gap-2 text-[10px] text-slate-500">
            <span className="whitespace-nowrap text-slate-500">時間列</span>
            <select
              value={ganttTimelineMode}
              onChange={(e) => setGanttTimelineMode(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              title="時間列顯示方式（甘特內 Ctrl+滾輪仍可依模式縮放）"
            >
              <option value="auto">自動（縮小後僅月份）</option>
              <option value="dayWeek">日與週</option>
              <option value="monthOnly">僅月份</option>
            </select>
          </label>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <span className="whitespace-nowrap">提示點顏色</span>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(offscreenDotHex) ? offscreenDotHex : GANTT_OFFSCREEN_DOT.backgroundColor}
              onChange={(e) => {
                const v = e.target.value;
                setOffscreenDotHex(v);
                try {
                  localStorage.setItem(GANTT_OFFSCREEN_DOT_STORAGE_KEY, v);
                } catch (_) {
                  /* ignore */
                }
              }}
              className="h-8 w-10 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white p-0 shadow-sm"
              title="拖拉選色；會記錄在此瀏覽器"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : scheduleTab === 'studio' ? (
        <StudioProjectsGantt
          projects={projects}
          allocations={allocations}
          onUpdate={refresh}
          rangeWeeks={rangeWeeks}
          timelineMode={ganttTimelineMode}
          onTimelineModeChange={setGanttTimelineMode}
          offscreenDotColor={offscreenDotHex}
        />
      ) : (
        <Gantt
          members={members}
          allocations={allocations}
          onUpdate={refresh}
          rangeWeeks={rangeWeeks}
          showRowDelete
          emptyHint="尚無分配列。請按「新增分配」選擇專案與成員，即可新增一列。"
          timelineMode={ganttTimelineMode}
          onTimelineModeChange={setGanttTimelineMode}
          offscreenDotColor={offscreenDotHex}
        />
      )}

      {allocModalOpen && (
        <Modal title="新增時間分配（全域時程）" onClose={() => setAllocModalOpen(false)}>
          <form onSubmit={saveAllocation} className="space-y-4">
            <div>
              <Label>專案 *</Label>
              <Select
                value={allocForm.project_id}
                onChange={(v) => setAllocForm((f) => ({ ...f, project_id: v }))}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                required
              />
            </div>
            <div>
              <Label>成員 *</Label>
              <Select
                value={allocForm.member_id}
                onChange={(v) => setAllocForm((f) => ({ ...f, member_id: v }))}
                options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.role})` }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>開始日期</Label>
                <Input
                  type="date"
                  value={allocForm.start_date}
                  onChange={(v) => setAllocForm((f) => ({ ...f, start_date: v }))}
                  required
                />
              </div>
              <div>
                <Label>結束日期</Label>
                <Input
                  type="date"
                  value={allocForm.end_date}
                  onChange={(v) => setAllocForm((f) => ({ ...f, end_date: v }))}
                  required
                />
              </div>
            </div>
            <div>
              <Label>備註</Label>
              <Input value={allocForm.notes} onChange={(v) => setAllocForm((f) => ({ ...f, notes: v }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple">
                建立
              </button>
              <button type="button" onClick={() => setAllocModalOpen(false)} className="px-4 text-sm text-gray-500">
                取消
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Label({ children }) { return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>; }
function Input({ type = 'text', value, onChange, required }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}
function Select({ value, onChange, options, required }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">請選擇</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

