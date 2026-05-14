'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { api } from '../../../../lib/api';
import Gantt from '../../../../components/Gantt';

export default function ProjectSchedulePage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [projectAllocations, setProjectAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ganttWeeks, setGanttWeeks] = useState(12);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [allocForm, setAllocForm] = useState(defaultAllocForm());

  function defaultAllocForm() {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return {
      member_id: '',
      start_date: format(today, 'yyyy-MM-dd'),
      end_date: format(end, 'yyyy-MM-dd'),
      notes: '',
    };
  }

  const load = useCallback(async () => {
    const [proj, memberList, allocs] = await Promise.all([
      api.getProject(id),
      api.getTeamMembers(),
      api.getProjectAllocations(id),
    ]);
    setProject(proj);
    setMembers(memberList);
    setProjectAllocations(allocs);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refreshGantt = useCallback(() => {
    load();
  }, [load]);

  const saveProjectAlloc = async (e) => {
    e.preventDefault();
    if (!allocForm.member_id || !allocForm.start_date || !allocForm.end_date) {
      alert('請選擇成員並填寫開始／結束日期');
      return;
    }
    try {
      await api.createAllocation({
        project_id: id,
        member_id: allocForm.member_id,
        start_date: allocForm.start_date,
        end_date: allocForm.end_date,
        notes: allocForm.notes || undefined,
      });
      setAllocModalOpen(false);
      setAllocForm(defaultAllocForm());
      load();
    } catch (err) {
      if (err.data?.conflicts?.length) {
        alert(`時程衝突：${err.data.conflicts.map((c) => c.project_name || c.task_name || '分配').join('、')}`);
      } else {
        alert(err.message || '建立失敗');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-8 text-gray-400">
        找不到專案 ·{' '}
        <Link href="/projects" className="text-indigo-600 hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 animate-fade-in max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/projects" className="hover:text-gray-600">
          專案
        </Link>
        <span>/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-600 truncate max-w-[200px]">
          {project.name}
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">時程甘特（專案）</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{project.name}</h1>
          <p className="text-gray-400 mt-1 text-sm">
            僅顯示此專案的時間分配 · {projectAllocations.length} 列 ·{' '}
            <Link href={`/projects/${id}`} className="text-indigo-600 hover:underline">
              返回專案詳情
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setAllocForm(defaultAllocForm());
              setAllocModalOpen(true);
            }}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-apple font-medium transition-colors shadow-apple-sm"
          >
            + 新增分配（加列）
          </button>
          <select
            value={ganttWeeks}
            onChange={(e) => setGanttWeeks(Number(e.target.value))}
            className="bg-white border border-gray-200 rounded-apple px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-apple-sm"
          >
            <option value={8}>8 週</option>
            <option value={12}>12 週</option>
            <option value={16}>16 週</option>
            <option value={24}>24 週</option>
          </select>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        此頁以<strong className="font-semibold text-slate-700">專案</strong>為範圍；每位成員一列，列上可有多筆時段。
        可按「新增分配」增加列，列旁的「刪除」可移除該筆分配。拖曳時段<strong className="font-semibold text-slate-700">不會</strong>改指派到其他成員。
      </p>

      <Gantt
        members={members}
        allocations={projectAllocations}
        onUpdate={refreshGantt}
        rangeWeeks={ganttWeeks}
        showRowDelete
        lockMemberRowOnMove
        labelColumnTitle="成員"
        emptyHint="此專案尚無時間分配，請按「新增分配」建立第一列。"
      />

      {allocModalOpen && (
        <Modal title="新增專案時間分配" onClose={() => setAllocModalOpen(false)}>
          <form onSubmit={saveProjectAlloc} className="space-y-4">
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
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
