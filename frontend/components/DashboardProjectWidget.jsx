'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { api } from '../lib/api';
import { MILESTONE_TEMPLATE_OPTIONS } from '../lib/milestone-templates';

function fmtEndShort(d) {
  if (!d) return '—';
  try {
    const x = String(d).slice(0, 10);
    const [, m, day] = x.split('-');
    return m && day ? `${m}/${day}` : '—';
  } catch {
    return '—';
  }
}

function statusZh(s) {
  switch (String(s || '').toLowerCase()) {
    case 'completed':
    case 'done':
      return '完成';
    case 'paused':
      return '暫停';
    case 'cancelled':
      return '取消';
    case 'wrapping':
      return '收尾';
    case 'active':
    case 'in_progress':
      return '進行';
    default:
      return '規劃';
  }
}

/**
 * @param {object[]} [todayAssignments] — 今日與分配區間重疊的列（含 projectId），呈現在對應專案下方小字
 */
export default function DashboardProjectWidget({ viewerId, projects, todayAssignments = [] }) {
  const projectIds = useMemo(() => projects.map((p) => p.id).filter(Boolean), [projects]);

  const todayByProject = useMemo(() => {
    const m = {};
    for (const row of todayAssignments) {
      const pid = row.projectId != null ? String(row.projectId) : '';
      if (!pid) continue;
      if (!m[pid]) m[pid] = [];
      m[pid].push(row);
    }
    return m;
  }, [todayAssignments]);

  const summaryKey =
    viewerId && projectIds.length ? ['milestone-sum', viewerId, [...projectIds].sort().join('|')] : null;
  const { data: summary = {}, mutate: mutateSummary } = useSWR(summaryKey, () =>
    api.getMilestoneSummaryByProjects(projectIds)
  );

  const { data: personalTasks = [], mutate: mutatePersonal } = useSWR(
    viewerId ? ['personal-tasks', viewerId] : null,
    () => api.getPersonalTasks({ member_id: viewerId })
  );

  const tasksByProject = useMemo(() => {
    const map = {};
    for (const t of personalTasks) {
      const pid = String(t.project_id);
      if (!map[pid]) map[pid] = [];
      map[pid].push(t);
    }
    return map;
  }, [personalTasks]);

  const [expandedId, setExpandedId] = useState(null);
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [templateChoice, setTemplateChoice] = useState('generic');

  const { data: expandedMilestones = [], mutate: mutateExpandedList } = useSWR(
    expandedId ? ['milestones-list', expandedId] : null,
    () => api.getProjectMilestones(expandedId)
  );

  const refreshMilestoneData = () => {
    mutateSummary();
    mutateExpandedList();
  };

  const expandedProj = projects.find((p) => String(p.id) === String(expandedId));

  const progressFor = (pid) => {
    const s = summary[String(pid)] || summary[pid];
    if (!s || !s.total) return { pct: 0, empty: true };
    return { pct: Math.round((s.completed / s.total) * 100), empty: false };
  };

  const toggleExpanded = (pid) => {
    const id = String(pid);
    setExpandedId((cur) => (cur === id ? null : id));
    setNewMilestoneLabel('');
    setNewReminder('');
  };

  const onBootstrap = async () => {
    if (!expandedId) return;
    try {
      await api.bootstrapProjectMilestones({ project_id: expandedId, template: templateChoice });
      refreshMilestoneData();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const onAddFinalEditRound = async () => {
    if (!expandedId) return;
    try {
      await api.addFinalEditRound(expandedId);
      refreshMilestoneData();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const hasFinalDelivery = expandedMilestones.some((m) => /final\s*delivery/i.test(String(m.label)));

  const onToggleMilestone = async (m) => {
    try {
      await api.updateProjectMilestone(m.id, { completed: !m.completed });
      refreshMilestoneData();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const onAddMilestone = async (e) => {
    e.preventDefault();
    if (!expandedId || !newMilestoneLabel.trim()) return;
    try {
      await api.createProjectMilestone({ project_id: expandedId, label: newMilestoneLabel.trim() });
      setNewMilestoneLabel('');
      refreshMilestoneData();
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const onDeleteMilestone = async (id) => {
    if (!confirm('刪除此里程碑？')) return;
    try {
      await api.deleteProjectMilestone(id);
      refreshMilestoneData();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const onAddReminder = async (e) => {
    e.preventDefault();
    if (!expandedId || !viewerId || !newReminder.trim()) return;
    try {
      await api.createPersonalTask({
        team_member_id: viewerId,
        project_id: expandedId,
        title: newReminder.trim(),
      });
      setNewReminder('');
      mutatePersonal();
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const onToggleUrgent = async (t) => {
    try {
      await api.updatePersonalTask(t.id, { urgent: !t.urgent });
      mutatePersonal();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  const onDeleteReminder = async (id) => {
    try {
      await api.deletePersonalTask(id);
      mutatePersonal();
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  if (!viewerId) {
    return (
      <section className="mt-6 surface rounded-[22px] px-6 py-10 text-center text-sm text-stone-400">
        選擇成員後可在此追蹤專案里程碑與今日排程
      </section>
    );
  }

  if (!projects.length) {
    return (
      <section className="mt-6 surface rounded-[22px] px-6 py-10 text-center text-sm text-stone-500">
        尚未有被分配的專案。請在下方「工作時程」將你加入專案後，此區會列出可追蹤的專案。
      </section>
    );
  }

  return (
    <section className="mt-6 surface rounded-[22px] overflow-hidden">
      <div className="px-6 pt-6 pb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "Georgia, 'Noto Serif TC', serif" }}
          >
            專案進度
          </h2>
          <p className="mt-1 text-[11px] text-stone-500 tracking-wide">
            主列為里程碑完成度 · 細字為今日甘特／任務分配與個人提醒
          </p>
        </div>
        <Link href="/tasks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0 pt-1">
          所有任務
        </Link>
      </div>

      <div className="px-6 pb-6 divide-y divide-stone-200/75">
        {projects.map((p) => {
          const idStr = String(p.id);
          const isSelected = expandedId === idStr;
          const { pct, empty } = progressFor(p.id);
          const dayRows = todayByProject[idStr] || [];
          const ptasks = tasksByProject[idStr] || [];
          const hasSubtitles = dayRows.length > 0 || ptasks.length > 0;
          const st = String(p.status || '').toLowerCase();

          return (
            <div key={p.id} className="py-3">
              <button
                type="button"
                onClick={() => toggleExpanded(p.id)}
                className="w-full grid grid-cols-[1fr_auto_auto] gap-3 sm:gap-5 items-center text-left bg-transparent border-none cursor-pointer py-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
                style={{
                  opacity: expandedId && !isSelected ? 0.75 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <div className="min-w-0">
                  <div
                    className="flex items-center gap-2 mb-1.5"
                    style={{
                      fontFamily: "'Noto Sans TC', ui-sans-serif, system-ui, sans-serif",
                      fontSize: 14,
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? p.color || '#1A1A2E' : '#1e293b',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {(isSelected || hasSubtitles) && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background: p.color || '#6366f1',
                          opacity: hasSubtitles ? 1 : 0.45,
                        }}
                      />
                    )}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <div className="h-0.5 rounded-full bg-stone-200/90 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: empty ? '4%' : `${pct}%`,
                        background: p.color || '#6366f1',
                        opacity: isSelected ? 1 : 0.55,
                      }}
                    />
                  </div>
                  {empty && (
                    <p className="mt-1 text-[10px] text-stone-400">尚未設定里程碑 · 展開後可套用公版</p>
                  )}
                </div>

                <span
                  className="text-xs font-semibold tabular-nums shrink-0"
                  style={{ color: isSelected ? p.color || '#64748b' : '#94a3b8' }}
                >
                  {empty ? '—' : `${pct}%`}
                </span>

                <span className="text-[11px] text-stone-400 whitespace-nowrap shrink-0 hidden sm:block">
                  {(st === 'wrapping' ? '收尾 · ' : '') + fmtEndShort(p.end_date)}
                  <span className="ml-1.5 text-[10px] text-stone-400">· {statusZh(p.status)}</span>
                </span>
              </button>

              {!isSelected && hasSubtitles && (
                <div className="mt-2.5 ml-0.5 space-y-1 pl-3 border-l border-stone-200/90">
                  {dayRows.map((row) => (
                    <Link
                      key={row.key}
                      href={row.href}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-snug rounded-md px-1 py-0.5 -mx-1 hover:bg-white/40 transition"
                      style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
                    >
                      <span
                        className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                        style={{ background: p.color || '#6366f1' }}
                      />
                      <span className={`text-slate-800 ${row.badge !== '排程' ? 'font-semibold' : 'font-medium'}`}>
                        {row.title}
                      </span>
                      <span className="text-stone-400 text-[10px] truncate max-w-full">
                        {row.remainingWord !== '—' && row.remainingAbs != null
                          ? `${row.remainingWord} ${row.remainingAbs} 個工作日 · `
                          : ''}
                        {row.badge}
                      </span>
                    </Link>
                  ))}
                  {ptasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-snug px-1 py-0.5 -mx-1"
                      style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
                    >
                      <span
                        className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                        style={{ background: t.urgent ? p.color || '#6366f1' : '#d6d3d1' }}
                      />
                      <span className={t.urgent ? 'font-semibold text-slate-900' : 'font-normal text-stone-600'}>
                        {t.title}
                      </span>
                      <span className="text-[10px] text-stone-400">個人提醒</span>
                    </div>
                  ))}
                </div>
              )}

              {isSelected && (
                <div className="mt-4 rounded-xl bg-white/35 ring-1 ring-white/60 p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      開啟專案頁 →
                    </Link>
                    <span className="text-stone-300">|</span>
                    <select
                      value={templateChoice}
                      onChange={(e) => setTemplateChoice(e.target.value)}
                      className="text-xs rounded-lg border border-stone-200 bg-white px-2 py-1 text-slate-700"
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
                      className="text-xs font-semibold px-2 py-1 rounded-lg bg-stone-800 text-white hover:bg-stone-900"
                    >
                      套用（僅空專案）
                    </button>
                    {hasFinalDelivery && (
                      <button
                        type="button"
                        onClick={onAddFinalEditRound}
                        className="text-xs font-semibold px-2 py-1 rounded-lg border border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
                        title="在 Final Delivery 前插入下一輪 Final Edit"
                      >
                        ＋ Final Edit 輪次
                      </button>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {expandedMilestones.map((m) => (
                      <li key={m.id} className="flex items-start gap-2 group">
                        <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={m.completed}
                            onChange={() => onToggleMilestone(m)}
                            className="mt-1 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span
                            className={`text-sm ${m.completed ? 'text-stone-400 line-through' : 'text-slate-800'}`}
                          >
                            {m.label}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => onDeleteMilestone(m.id)}
                          className="opacity-0 group-hover:opacity-100 text-[11px] text-rose-600 hover:underline shrink-0"
                        >
                          刪除
                        </button>
                      </li>
                    ))}
                  </ul>

                  <form onSubmit={onAddMilestone} className="flex gap-2 flex-wrap">
                    <input
                      value={newMilestoneLabel}
                      onChange={(e) => setNewMilestoneLabel(e.target.value)}
                      placeholder="新增里程碑…"
                      className="flex-1 min-w-[140px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-indigo-600 text-white text-sm font-semibold px-4 py-2 hover:bg-indigo-700"
                    >
                      新增
                    </button>
                  </form>

                  <div className="border-t border-stone-200/80 pt-3">
                    <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-2">
                      個人提醒 · {expandedProj?.name || ''}
                    </p>
                    <ul className="space-y-2 mb-3">
                      {(tasksByProject[String(expandedId)] || []).map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => onToggleUrgent(t)}
                            className={`truncate flex-1 text-left ${t.urgent ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
                            title="切換急件"
                          >
                            {t.urgent ? '⚡ ' : ''}
                            {t.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteReminder(t.id)}
                            className="text-xs text-rose-600 hover:underline shrink-0"
                          >
                            刪除
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form onSubmit={onAddReminder} className="flex gap-2 flex-wrap">
                      <input
                        value={newReminder}
                        onChange={(e) => setNewReminder(e.target.value)}
                        placeholder="今天這個專案要記得…（Enter 送出）"
                        className="flex-1 min-w-[160px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-stone-300 bg-white text-sm font-semibold px-4 py-2 hover:bg-stone-50"
                      >
                        加入提醒
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
