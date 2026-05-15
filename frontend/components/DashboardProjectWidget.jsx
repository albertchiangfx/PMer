'use client';

import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { api } from '../lib/api';
import { MILESTONE_DATA_CHANGED_EVENT } from '../lib/dashboard-sync';

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
}) {
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

  if (!viewerId) {
    return (
      <section className="mt-6 surface rounded-[22px] px-6 py-10 text-center text-sm text-stone-400">
        選擇成員後可在此檢視里程碑與今日任務
      </section>
    );
  }

  if (!projectsForList.length) {
    return (
      <section className="mt-6 surface rounded-[22px] px-6 py-10 text-center text-sm text-stone-500">
        此成員今日尚無被指派的任務或個人任務；若有專案甘特排程請至下方「工作時程」查看。
      </section>
    );
  }

  return (
    <section className="mt-6 surface rounded-[22px] overflow-visible">
      <div className="px-6 pt-6 pb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "Georgia, 'Noto Serif TC', serif" }}
          >
            Tasks overview
          </h2>
          <p className="mt-1 text-[11px] text-stone-500 tracking-wide">
            依上方「檢視身分」僅顯示該成員今日被指派的任務與個人任務；里程碑請至「專案」或專案內「里程碑」
          </p>
        </div>
        <Link
          href="/tasks"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0 pt-1"
        >
          所有任務
        </Link>
      </div>

      <div className="px-6 pb-6 divide-y divide-stone-200/75">
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

          return (
            <div key={p.id} className="py-3 [contain:layout]">
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
                  {(st === 'wrapping' ? '收尾 · ' : '') + fmtEndShort(p.end_date)}
                  <span className="ml-1.5 text-[10px] text-stone-400">· {statusZh(p.status)}</span>
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
                  <Link
                    href={`/projects/${p.id}#tasks`}
                    className="shrink-0 self-center text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                  >
                    ＋ 新增任務
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
