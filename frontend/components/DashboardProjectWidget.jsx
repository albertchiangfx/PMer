'use client';

import { useEffect, useMemo, useState } from 'react';
import QuickTaskModal from './QuickTaskModal';
import useSWR from 'swr';
import Link from 'next/link';
import { api } from '../lib/api';
import { MILESTONE_DATA_CHANGED_EVENT, notifyScheduleDataChanged } from '../lib/dashboard-sync';

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
 * Dashboard：各專案里程碑完成度（進度條）與今日任務列（含個人任務；不含專案甘特排程）。
 * `projects` 應僅含「目前檢視成員」相關專案；若傳入 `personalTasks` 則不再重複請求個人任務 API。
 *
 * @param {object[]} [todayAssignments] — 今日與分配區間重疊的列（含 projectId、kind）
 * @param {object[]} [personalTasks] — 若由父層傳入則使用之，否則內部 useSWR 取得
 */
export default function DashboardProjectWidget({
  viewerId,
  projects,
  todayAssignments = [],
  personalTasks: personalTasksFromParent,
  compact = false,
  /** 桌面 Dashboard：區塊填滿中間捲動區，僅任務列表內捲動 */
  inFrame = false,
}) {
  const [taskModalProject, setTaskModalProject] = useState(null);
  const projectIds = useMemo(() => projects.map((p) => p.id).filter(Boolean), [projects]);

  const todayByProject = useMemo(() => {
    const m = {};
    for (const row of todayAssignments) {
      const pid = row.projectId != null ? String(row.projectId).toLowerCase() : '';
      if (!pid) continue;
      if (!m[pid]) m[pid] = [];
      m[pid].push(row);
    }
    return m;
  }, [todayAssignments]);

  const summaryKey =
    viewerId && projectIds.length
      ? ['milestone-sum', viewerId, [...projectIds].sort().join('|')]
      : null;
  const { data: summary = {}, mutate: mutateSummary } = useSWR(summaryKey, () =>
    api.getMilestoneSummaryByProjects(projectIds)
  );

  useEffect(() => {
    const onMilestonesChanged = () => {
      mutateSummary(undefined, { revalidate: true });
    };
    window.addEventListener(MILESTONE_DATA_CHANGED_EVENT, onMilestonesChanged);
    return () => window.removeEventListener(MILESTONE_DATA_CHANGED_EVENT, onMilestonesChanged);
  }, [mutateSummary]);

  const summaryByPid = useMemo(() => {
    const o = {};
    for (const [k, v] of Object.entries(summary)) {
      o[String(k).toLowerCase()] = v;
    }
    return o;
  }, [summary]);

  const { data: personalTasksFromSwr = [] } = useSWR(
    personalTasksFromParent !== undefined ? null : viewerId ? ['personal-tasks', viewerId] : null,
    () => api.getPersonalTasks({ member_id: viewerId })
  );
  const personalTasks =
    personalTasksFromParent !== undefined ? personalTasksFromParent : personalTasksFromSwr;

  /** 含僅有個人任務、未出現在甘特／分配裡的專案 */
  const projectsForList = useMemo(() => {
    const byKey = new Map();
    for (const p of projects) {
      byKey.set(String(p.id).toLowerCase(), p);
    }
    for (const t of personalTasks) {
      const k = String(t.project_id || '').toLowerCase();
      if (!k || byKey.has(k)) continue;
      byKey.set(k, {
        id: t.project_id,
        name: t.project_name || '專案',
        color: t.project_color || '#6366f1',
        end_date: null,
        status: 'planning',
        client_name: null,
      });
    }
    return Array.from(byKey.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [projects, personalTasks]);

  const progressFor = (pid) => {
    const s = summaryByPid[String(pid).toLowerCase()];
    if (!s || !s.total) return { pct: 0, empty: true };
    return { pct: Math.round((s.completed / s.total) * 100), empty: false };
  };

  const sectionMt = inFrame ? '' : compact ? 'mt-3' : 'mt-6';
  const sectionRound = compact ? 'rounded-xl' : 'rounded-[22px]';
  const sectionPad = compact ? 'px-2' : 'px-6';
  const sectionLayout =
    inFrame && !compact
      ? 'flex flex-col flex-1 h-full min-h-[var(--dashboard-tasks-min-height,300px)] overflow-hidden'
      : '';

  if (!viewerId) {
    return (
      <section
        className={`${sectionMt} surface ${sectionRound} ${sectionPad} py-8 md:py-10 text-center text-sm text-stone-400`}
      >
        選擇成員後可在此檢視里程碑與今日任務
      </section>
    );
  }

  if (!projectsForList.length) {
    return (
      <section
        className={`${sectionMt} surface ${sectionRound} ${sectionPad} py-8 md:py-10 text-center text-sm text-stone-500`}
      >
        {compact
          ? '此成員今日尚無任務；可從上方進入專案或工作時程。'
          : '此成員今日尚無被指派的任務或個人任務；若有專案甘特排程請至下方「工作時程」查看。'}
      </section>
    );
  }

  const listScrollClass =
    inFrame && !compact
      ? `scroll-pane ${sectionPad} pb-3 md:pb-6 flex-1 min-h-0 divide-y divide-stone-200/75`
      : `${sectionPad} pb-3 md:pb-6 ${compact ? 'space-y-2.5' : 'divide-y divide-stone-200/75'}`;

  return (
    <section className={`${sectionMt} ${sectionLayout} surface ${sectionRound} overflow-hidden`}>
      <div
        className={`${sectionPad} pt-3 md:pt-6 pb-2 flex flex-wrap items-start justify-between gap-2 md:gap-3 shrink-0`}
      >
        <div className="min-w-0 flex-1">
          <h2
            className={`font-semibold tracking-tight text-slate-900 ${
              compact ? 'text-sm' : 'text-lg'
            }`}
            style={
              compact
                ? undefined
                : { fontFamily: "Georgia, 'Noto Serif TC', serif" }
            }
          >
            {compact ? '任務總覽' : 'Tasks overview'}
          </h2>
          {!compact ? (
            <p className="mt-1 text-[11px] text-stone-500 tracking-wide">
              依上方「檢視身分」僅顯示該成員今日被指派的任務與個人任務；里程碑請至「專案」或專案內「里程碑」
            </p>
          ) : null}
        </div>
        <Link
          href="/tasks"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0"
        >
          所有任務
        </Link>
      </div>

      <div className={listScrollClass}>
        {projectsForList.map((p) => {
          const idLc = String(p.id).toLowerCase();
          const { pct, empty } = progressFor(p.id);
          const dayRows = todayByProject[idLc] || [];
          const taskRows = dayRows.filter((r) => r.kind === 'task');
          const personalForProject = personalTasks.filter(
            (t) => String(t.project_id || '').toLowerCase() === idLc
          );
          const showActivityStrip = taskRows.length > 0 || personalForProject.length > 0;
          const st = String(p.status || '').toLowerCase();
          const metaLine = `${st === 'wrapping' ? '收尾 · ' : ''}${fmtEndShort(p.end_date)} · ${statusZh(p.status)}`;

          if (compact) {
            return (
              <article
                key={p.id}
                className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-sm"
              >
                <Link
                  href={`/projects/${p.id}`}
                  className="block px-2.5 py-2 border-b border-slate-100 active:bg-slate-50/80"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className="w-1 h-10 rounded-full shrink-0"
                      style={{ background: p.color || '#6366f1' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-semibold text-slate-900 truncate text-sm">
                          {p.name}
                        </h3>
                        <span className="text-xs font-bold tabular-nums text-slate-600 shrink-0">
                          {empty ? '—' : `${pct}%`}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">{metaLine}</p>
                      <div className="mt-2 h-1 rounded-full bg-stone-200/90 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: empty ? '4%' : `${pct}%`,
                            background: p.color || '#6366f1',
                          }}
                        />
                      </div>
                      {empty ? (
                        <p className="mt-1 text-[10px] text-stone-400">
                          尚未設定里程碑 ·{' '}
                          <span className="text-indigo-600">至專案設定</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>

                {showActivityStrip ? (
                  <ul className="px-2.5 py-2 space-y-2 border-b border-slate-100">
                    {taskRows.map((row) => (
                      <li key={row.key}>
                        <Link href={row.href} className="block min-w-0 active:opacity-80">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {row.title}
                          </p>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            {row.remainingWord !== '—' && row.remainingAbs != null
                              ? `${row.remainingWord} ${row.remainingAbs} 工作日 · `
                              : ''}
                            {row.badge}
                          </p>
                        </Link>
                      </li>
                    ))}
                    {personalForProject.map((t) => (
                      <li key={`pt-${t.id}`}>
                        <Link href="/tasks" className="block min-w-0 active:opacity-80">
                          <p
                            className={`text-sm truncate ${
                              t.urgent ? 'font-semibold text-slate-900' : 'font-medium text-stone-700'
                            }`}
                          >
                            {t.title}
                          </p>
                          <p className="text-[11px] text-stone-500 mt-0.5">個人任務</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2.5 py-2 text-[11px] text-stone-400 border-b border-slate-100">
                    今日此專案無任務列
                  </p>
                )}

                <div className="flex divide-x divide-slate-100">
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-indigo-600 active:bg-indigo-50/50"
                  >
                    時程
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTaskModalProject(p)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-600 active:bg-slate-50"
                  >
                    ＋ 任務
                  </button>
                </div>
              </article>
            );
          }

          return (
            <div key={p.id} className="py-3">
              <div className="w-full grid grid-cols-[1fr_auto_auto] gap-3 sm:gap-5 items-start text-left py-2 rounded-lg min-h-[52px] relative z-[1]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {showActivityStrip && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background: p.color || '#6366f1',
                          opacity: 1,
                        }}
                      />
                    )}
                    <Link
                      href={`/projects/${p.id}#milestones`}
                      className="truncate font-medium text-slate-900 hover:text-indigo-700"
                      style={{
                        fontFamily: "'Noto Sans TC', ui-sans-serif, system-ui, sans-serif",
                        fontSize: 14,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {p.name}
                    </Link>
                  </div>
                  <div className="relative h-6 w-full flex items-center mt-0.5">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-stone-200/90 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: empty ? '4%' : `${pct}%`,
                          background: p.color || '#6366f1',
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                  {empty && (
                    <p className="mt-1 text-[10px] text-stone-400">
                      尚未設定里程碑 ·{' '}
                      <Link
                        href={`/projects/${p.id}#milestones`}
                        className="text-indigo-600 hover:underline"
                      >
                        至專案頁設定
                      </Link>
                    </p>
                  )}
                </div>

                <span className="text-xs font-semibold tabular-nums shrink-0 text-slate-500 pt-1">
                  {empty ? '—' : `${pct}%`}
                </span>

                <span className="text-[11px] text-stone-400 whitespace-nowrap shrink-0 hidden sm:block pt-1">
                  {metaLine}
                </span>
              </div>

              {showActivityStrip ? (
                <div className="mt-2.5 ml-0.5 flex items-start gap-3 pl-3 border-l border-stone-200/90 min-w-0">
                  <div className="flex flex-1 flex-wrap items-start gap-x-5 gap-y-2 min-w-0">
                    {taskRows.map((row) => (
                      <div
                        key={row.key}
                        className="text-[11px] leading-snug min-w-0 max-w-[11rem] sm:max-w-[14rem]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-1 h-1 rounded-full shrink-0"
                            style={{ background: p.color || '#6366f1' }}
                          />
                          <Link
                            href={row.href}
                            className="font-semibold text-slate-900 hover:text-indigo-700 truncate"
                            style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
                          >
                            {row.title}
                          </Link>
                        </div>
                        <p className="mt-0.5 pl-3 text-[10px] text-stone-400 truncate">
                          {row.remainingWord !== '—' && row.remainingAbs != null
                            ? `${row.remainingWord} ${row.remainingAbs} 個工作日 · `
                            : ''}
                          {row.badge}
                        </p>
                      </div>
                    ))}
                    {personalForProject.map((t) => (
                      <div
                        key={`pt-${t.id}`}
                        className="text-[11px] leading-snug min-w-0 max-w-[11rem] sm:max-w-[14rem]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-1 h-1 rounded-full shrink-0"
                            style={{ background: t.urgent ? p.color || '#6366f1' : '#a8a29e' }}
                          />
                          <Link
                            href="/tasks"
                            className={`truncate hover:text-indigo-700 ${
                              t.urgent
                                ? 'font-semibold text-slate-900'
                                : 'font-medium text-stone-700'
                            }`}
                            style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
                          >
                            {t.title}
                          </Link>
                        </div>
                        <p className="mt-0.5 pl-3 text-[10px] text-stone-400">個人任務</p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskModalProject(p)}
                    className="shrink-0 self-center text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                  >
                    ＋ 新增任務
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {taskModalProject ? (
        <QuickTaskModal
          project={taskModalProject}
          onClose={() => setTaskModalProject(null)}
          onCreated={() => notifyScheduleDataChanged()}
        />
      ) : null}
    </section>
  );
}
