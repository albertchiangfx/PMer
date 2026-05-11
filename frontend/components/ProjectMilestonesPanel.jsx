'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';
import { MILESTONE_TEMPLATE_OPTIONS } from '../lib/milestone-templates';
import { notifyMilestoneDataChanged } from '../lib/dashboard-sync';

function normalizePid(raw) {
  if (raw == null) return '';
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v ?? '').trim();
}

/**
 * 專案總覽：里程碑套用公版、勾選完成、新增／刪除、排序（上移／下移）、Final Edit 輪次。
 */
export default function ProjectMilestonesPanel({ projectId, projectName }) {
  const pid = normalizePid(projectId);
  const [templateChoice, setTemplateChoice] = useState('generic');
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('');
  const [reordering, setReordering] = useState(false);
  const [draggingId, setDraggingId] = useState(null);

  const {
    data: milestones = [],
    error: swrError,
    mutate: mutateList,
  } = useSWR(pid ? ['project-milestones', pid] : null, () => api.getProjectMilestones(pid));

  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [milestones]);

  const refresh = async () => {
    await mutateList(undefined, { revalidate: true });
    notifyMilestoneDataChanged();
  };

  const persistOrder = async (orderedIds) => {
    try {
      setReordering(true);
      await api.reorderProjectMilestones(orderedIds);
      await mutateList(undefined, { revalidate: true });
      notifyMilestoneDataChanged();
    } catch (e) {
      alert(e.message || String(e));
      await mutateList(undefined, { revalidate: true });
    } finally {
      setReordering(false);
    }
  };

  const onDropOnRow = async (e, targetId) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-milestone-id');
    setDraggingId(null);
    if (!draggedId || draggedId === targetId || reordering) return;
    const ids = sortedMilestones.map((m) => m.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    await persistOrder(next);
  };

  const moveMilestone = async (milestoneId, delta) => {
    const ids = sortedMilestones.map((m) => m.id);
    const i = ids.indexOf(milestoneId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    const t = next[i];
    next[i] = next[j];
    next[j] = t;
    await persistOrder(next);
  };

  const onBootstrap = async () => {
    if (!pid) return;
    try {
      await api.bootstrapProjectMilestones({ project_id: pid, template: templateChoice });
      await refresh();
    } catch (e) {
      const msg =
        e.status === 409
          ? '此專案已有里程碑紀錄，無法再次套用公版。若要重來請先刪除既有里程碑。'
          : e.message || String(e);
      alert(msg);
    }
  };

  const onAddFinalEditRound = async () => {
    if (!pid) return;
    try {
      await api.addFinalEditRound(pid);
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const hasFinalDelivery = sortedMilestones.some((m) => /final\s*delivery/i.test(String(m.label)));

  const onToggleMilestone = async (m) => {
    try {
      await api.updateProjectMilestone(m.id, { completed: !m.completed });
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const onAddMilestone = async (e) => {
    e.preventDefault();
    if (!pid || !newMilestoneLabel.trim()) return;
    try {
      await api.createProjectMilestone({ project_id: pid, label: newMilestoneLabel.trim() });
      setNewMilestoneLabel('');
      await refresh();
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const onDeleteMilestone = async (mid) => {
    if (!confirm('刪除此里程碑？')) return;
    try {
      await api.deleteProjectMilestone(mid);
      await refresh();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  if (!pid) return null;

  const fetchErr =
    swrError instanceof Error ? swrError.message : swrError ? String(swrError) : null;

  return (
    <div className="space-y-4 relative pointer-events-auto">
      {fetchErr && (
        <p className="text-sm text-rose-600 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
          無法載入里程碑（請確認 API 網址與後端已啟動）：{fetchErr}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={templateChoice}
          onChange={(e) => setTemplateChoice(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {MILESTONE_TEMPLATE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              公版：{o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onBootstrap}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
        >
          套用（僅空專案）
        </button>
        {hasFinalDelivery && (
          <button
            type="button"
            onClick={onAddFinalEditRound}
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            title="在 Final Delivery 前插入下一輪 Final Edit"
          >
            ＋ Final Edit 輪次
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        按住左側「⠿」拖曳排序，或使用「上移／下移」（會同步存進資料庫）
        {projectName ? ` · ${projectName}` : ''}
      </p>

      <ul className={`space-y-2 ${reordering ? 'opacity-60' : ''}`}>
        {sortedMilestones.map((m, idx) => (
          <li
            key={m.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => onDropOnRow(e, m.id)}
            className={`flex items-start gap-2 group rounded-lg px-2 py-1.5 transition-colors bg-white/80 ${
              draggingId === m.id ? 'opacity-50 ring-2 ring-indigo-200' : ''
            }`}
          >
            <div className="flex flex-row shrink-0 gap-1 mt-0.5 items-start" aria-label="排序">
              <span
                title="拖曳排序"
                draggable={!reordering}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-milestone-id', m.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggingId(m.id);
                }}
                onDragEnd={() => setDraggingId(null)}
                className="cursor-grab active:cursor-grabbing leading-none px-1 py-1 text-xs rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 select-none touch-none"
              >
                ⠿
              </span>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={reordering || idx === 0}
                  onClick={() => moveMilestone(m.id, -1)}
                  className="leading-none px-1 py-0 text-[10px] rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={reordering || idx === sortedMilestones.length - 1}
                  onClick={() => moveMilestone(m.id, 1)}
                  className="leading-none px-1 py-0 text-[10px] rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="下移"
                >
                  ↓
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <input
                id={`ms-done-${m.id}`}
                type="checkbox"
                checked={!!m.completed}
                disabled={reordering}
                onChange={() => onToggleMilestone(m)}
                className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
              <label
                htmlFor={`ms-done-${m.id}`}
                className={`text-sm cursor-pointer flex-1 min-w-0 ${m.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}
              >
                {m.label}
              </label>
            </div>
            <button
              type="button"
              disabled={reordering}
              onClick={() => onDeleteMilestone(m.id)}
              className="text-xs text-rose-600 hover:underline shrink-0 sm:opacity-100 opacity-0 group-hover:opacity-100"
            >
              刪除
            </button>
          </li>
        ))}
      </ul>

      {sortedMilestones.length === 0 && !fetchErr && (
        <p className="text-sm text-gray-400 py-2">尚無里程碑 · 可選公版後按「套用」，或下方手動新增。</p>
      )}

      <form onSubmit={onAddMilestone} className="flex gap-2 flex-wrap pt-1">
        <input
          value={newMilestoneLabel}
          onChange={(e) => setNewMilestoneLabel(e.target.value)}
          placeholder="新增里程碑…"
          className="flex-1 min-w-[200px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 text-white text-sm font-semibold px-5 py-2 hover:bg-indigo-700"
        >
          新增
        </button>
      </form>
    </div>
  );
}
