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
 * Dashboard：僅檢視各專案里程碑完成度（進度條）與今日相關排程／提醒細字。
 * 不包含展開編輯；里程碑與個人提醒管理請至專案頁或任務頁。
 *
 * @param {object[]} [todayAssignments] — 今日與分配區間重疊的列（含 projectId）
 */
export default function DashboardProjectWidget({ viewerId, projects, todayAssignments = [] }) {
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
    viewerId && projectIds.length ? ['milestone-sum', viewerId, [...projectIds].sort().join('|')] : null;
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

  const { data: personalTasks = [] } = useSWR(viewerId ? ['personal-tasks', viewerId] : null, () =>
    api.getPersonalTasks({ member_id: viewerId })
  );

  const tasksByProject = useMemo(() => {
    const map = {};
    for (const t of personalTasks) {
      const pid = String(t.project_id).toLowerCase();
      if (!map[pid]) map[pid] = [];
      map[pid].push(t);
    }
    return map;
  }, [personalTasks]);

  const footerTodayChips = useMemo(() => {
    const list = [];
    for (const row of todayAssignments) {
      list.push({
        key: row.key,
        title: row.title,
        color: row.accentColor || '#78716c',
        muted: row.badge === '排程',
        href: row.href,
      });
    }
    for (const t of personalTasks) {
      const proj = projects.find((x) => String(x.id).toLowerCase() === String(t.project_id).toLowerCase());
      list.push({
        key: `r-${t.id}`,
        title: t.title,
        color: t.urgent ? proj?.color || '#6366f1' : '#d6d3d1',
        muted: !t.urgent,
        href: proj ? `/projects/${proj.id}` : '/tasks',
      });
    }
    return list;
  }, [todayAssignments, personalTasks, projects]);

  const progressFor = (pid) => {
    const s = summaryByPid[String(pid).toLowerCase()];
    if (!s || !s.total) return { pct: 0, empty: true };
    return { pct: Math.round((s.completed / s.total) * 100), empty: false };
  };

  if (!viewerId) {
    return (
      <section className="mt-6 surface rounded-[22px] px-6 py-10 text-center text-sm text-stone-400">
        選擇成員後可在此檢視專案里程碑完成度
      </section>
    );
  }

  if (!projects.length) {
    return (
      <section className="mt-6 surface rounded-[22px] px-6 py-10 text-center text-sm text-stone-500">
        尚未有被分配的專案。請在下方「工作時程」將你加入專案後，此區會列出里程碑進度。
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
            專案進度
          </h2>
          <p className="mt-1 text-[11px] text-stone-500 tracking-wide">
            僅顯示里程碑完成度；若要套用公版或調整細項請至各專案「里程碑」分頁
          </p>
        </div>
        <Link href="/tasks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 shrink-0 pt-1">
          所有任務
        </Link>
      </div>

      <div className="px-6 pb-6 divide-y divide-stone-200/75">
        {projects.map((p) => {
          const idLc = String(p.id).toLowerCase();
          const { pct, empty } = progressFor(p.id);
          const dayRows = todayByProject[idLc] || [];
          const ptasks = tasksByProject[idLc] || [];
          const hasSubtitles = dayRows.length > 0 || ptasks.length > 0;
          const st = String(p.status || '').toLowerCase();

          return (
            <div key={p.id} className="py-3">
              <div className="w-full grid grid-cols-[1fr_auto_auto] gap-3 sm:gap-5 items-center text-left py-2 rounded-lg min-h-[52px] relative z-[1]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {hasSubtitles && (
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
                      className="truncate font-medium text-slate-900 hover:text-indigo-700 transition-colors"
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
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
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
                      <Link href={`/projects/${p.id}#milestones`} className="text-indigo-600 hover:underline">
                        至專案頁設定
                      </Link>
                    </p>
                  )}
                </div>

                <span className="text-xs font-semibold tabular-nums shrink-0 text-slate-500">
                  {empty ? '—' : `${pct}%`}
                </span>

                <span className="text-[11px] text-stone-400 whitespace-nowrap shrink-0 hidden sm:block">
                  {(st === 'wrapping' ? '收尾 · ' : '') + fmtEndShort(p.end_date)}
                  <span className="ml-1.5 text-[10px] text-stone-400">· {statusZh(p.status)}</span>
                </span>
              </div>

              {!hasSubtitles && (
                <p className="mt-1.5 ml-0.5 text-[10px] text-stone-400">
                  今日與此專案重疊的排程／個人提醒將顯示於此列下方
                </p>
              )}

              {hasSubtitles && (
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
                        {t.urgent ? '⚡ ' : ''}
                        {t.title}
                      </span>
                      <span className="text-[10px] text-stone-400">個人提醒</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footerTodayChips.length > 0 && (
        <div className="px-6 pb-6 pt-1 mt-1 border-t border-stone-200/80">
          <div className="flex items-center gap-3 my-3">
            <div className="h-px flex-1 bg-stone-200/90" />
            <span
              className="text-[10px] font-semibold tracking-[0.14em] text-stone-400 shrink-0"
              style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
            >
              今日里程
            </span>
            <div className="h-px flex-1 bg-stone-200/90" />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {footerTodayChips.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className={`inline-flex items-center gap-2 text-xs hover:opacity-80 transition-opacity ${
                  c.muted ? 'font-normal' : 'font-semibold'
                }`}
                style={{
                  color: c.muted ? '#78716c' : '#0f172a',
                  fontFamily: "'Noto Sans TC', sans-serif",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />
                {c.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
