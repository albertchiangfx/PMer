'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  isValid,
  isWeekend,
  parseISO,
} from 'date-fns';
import { api } from '../lib/api';
import SchedulePanel from '../components/SchedulePanel';
import DashboardProjectWidget from '../components/DashboardProjectWidget';
import { SCHEDULE_DATA_CHANGED_EVENT } from '../lib/dashboard-sync';
import { useIsMobileLayout } from '../lib/use-mobile-layout';
import StudioVerticalSchedule from '../components/StudioVerticalSchedule';
import { pageFrameClass, pageFrameHeaderClass } from '../lib/page-layout';

/** 本地曆「今天」YYYY-MM-DD（避免 toISOString() 用 UTC 與台灣等地差一天） */
function localCalendarYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD for API dates (may be ISO strings with time). */
function toYmd(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * 僅用「這一列分配」的 start_date / end_date 判斷是否涵蓋 today（不用任務整體區間）。
 * 避免：成員時段已結束，但因任務仍進行中而誤出現在「今日」。
 */
function sliceDatesOverlapToday(raw, todayYmd) {
  const start = toYmd(raw?.start_date);
  const end = toYmd(raw?.end_date);
  if (!start && !end) return false;
  if (start && end) return start <= todayYmd && end >= todayYmd;
  if (start && !end) return start <= todayYmd;
  if (!start && end) return end >= todayYmd;
  return false;
}

/** `GET /tasks?team_member_id=` 回傳的 `allocations` 陣列中，是否有該成員的一段與 today 重疊。 */
function memberTaskSlicesOverlapToday(task, viewerId, todayYmd) {
  const allocs = Array.isArray(task?.allocations) ? task.allocations : [];
  for (const a of allocs) {
    if (!memberIdEquals(a?.team_member_id, viewerId)) continue;
    if (sliceDatesOverlapToday({ start_date: a.start_date, end_date: a.end_date }, todayYmd))
      return true;
  }
  return false;
}

/**
 * Dashboard「今日」任務 fallback：優先看 time_allocation 區間是否蓋到今天；
 * 若該成員在任務上已有分配列，但區間與任務主檔日期不一致導致沒蓋到今天，仍用任務起訖判斷（新指派／舊資料常見）。
 */
function viewerTaskEligibleForTodayOverview(task, viewerId, todayYmd) {
  if (memberTaskSlicesOverlapToday(task, viewerId, todayYmd)) return true;
  const allocs = Array.isArray(task?.allocations) ? task.allocations : [];
  const hasViewerAlloc = allocs.some((a) => memberIdEquals(a?.team_member_id, viewerId));
  if (!hasViewerAlloc) return false;
  return sliceDatesOverlapToday({ start_date: task.start_date, end_date: task.end_date }, todayYmd);
}

function allocationProgressPct(startYmd, endYmd, todayYmd) {
  try {
    const s = parseISO(toYmd(startYmd) || startYmd);
    const e = parseISO(toYmd(endYmd) || endYmd);
    const t = parseISO(todayYmd);
    if (!isValid(s) || !isValid(e) || !isValid(t)) return 0;
    const total = differenceInCalendarDays(e, s) + 1;
    if (total <= 0) return 0;
    const elapsed = differenceInCalendarDays(t, s) + 1;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  } catch {
    return 0;
  }
}

/** Weekdays remaining from tomorrow through end (negative if overdue). */
function businessDaysDelta(todayYmd, endYmd) {
  if (!todayYmd || !endYmd) return null;
  const todayD = parseISO(todayYmd);
  const endD = parseISO(endYmd);
  if (!isValid(todayD) || !isValid(endD)) return null;

  if (endD.getTime() >= todayD.getTime()) {
    const start = addDays(todayD, 1);
    if (start.getTime() > endD.getTime()) return 0;
    const days = eachDayOfInterval({ start, end: endD });
    return days.filter((d) => !isWeekend(d)).length;
  }

  const start = addDays(endD, 1);
  const end = addDays(todayD, -1);
  if (start.getTime() > end.getTime()) return 0;
  const days = eachDayOfInterval({ start, end });
  return -days.filter((d) => !isWeekend(d)).length;
}

/** 成員 UUID 比對（API / localStorage 大小寫可能不一致） */
function memberIdEquals(a, b) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

export default function Dashboard() {
  const isMobileLayout = useIsMobileLayout();
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [viewerId, setViewerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataTick, setDataTick] = useState(0);

  const loadCore = useCallback(async () => {
    const [m, a, p] = await Promise.all([
      api.getTeamMembers(),
      api.getAllocations(),
      api.getProjects(),
    ]);
    setMembers(m);
    setAllocations(Array.isArray(a) ? a : []);
    setProjects(Array.isArray(p) ? p : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCore()
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadCore, dataTick]);

  useEffect(() => {
    if (!members.length) return;

    // 已選的人若不在名單內（被刪除等）→ 改選仍在的成員
    if (viewerId && !members.some((m) => memberIdEquals(m.id, viewerId))) {
      const firstActive = members.find((m) => m.status === 'active') || members[0];
      if (firstActive) setViewerId(String(firstActive.id));
      return;
    }

    // 尚未選人時才自動帶入；選定後 members 再 refetch 不會覆寫下拉（避免 hot swap 無效）
    if (viewerId) return;

    try {
      const saved = localStorage.getItem('sp.viewerMemberId');
      if (saved) {
        const found = members.find((m) => memberIdEquals(m.id, saved));
        if (found) {
          setViewerId(String(found.id));
          return;
        }
      }
    } catch {
      // ignore
    }
    const firstActive = members.find((m) => m.status === 'active') || members[0];
    if (firstActive) setViewerId(String(firstActive.id));
  }, [members, viewerId]);

  useEffect(() => {
    if (!viewerId) return;
    try {
      localStorage.setItem('sp.viewerMemberId', String(viewerId));
    } catch {
      // ignore
    }
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId || !members.length) return;
    const viewer = members.find((m) => memberIdEquals(m.id, viewerId));
    if (!viewer) return;
    try {
      localStorage.setItem('sp.viewerMemberName', viewer.name || '');
      localStorage.setItem('sp.viewerMemberRole', viewer.role || '');
    } catch {
      // ignore
    }
  }, [viewerId, members]);

  const { data: taskAllocations = [], mutate: mutateTaskAlloc } = useSWR(
    viewerId ? ['time-allocations', viewerId] : null,
    ([, id]) =>
      api.getTimeAllocations({ team_member_id: id }).then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.filter((r) => memberIdEquals(r.team_member_id, id));
      }),
    { revalidateOnFocus: false }
  );

  const { data: viewerTasks = [], mutate: mutateViewerTasks } = useSWR(
    viewerId ? ['viewer-tasks', viewerId] : null,
    ([, id]) =>
      api.getTasks({ team_member_id: id }).then((rows) => (Array.isArray(rows) ? rows : [])),
    { revalidateOnFocus: false }
  );

  const { data: personalTasks = [], mutate: mutatePersonalTasks } = useSWR(
    viewerId ? ['personal-tasks', viewerId] : null,
    ([, id]) => api.getPersonalTasks({ member_id: id }),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    const onScheduleSync = () => {
      setDataTick((t) => t + 1);
      mutateTaskAlloc();
      mutateViewerTasks();
      mutatePersonalTasks();
    };
    window.addEventListener(SCHEDULE_DATA_CHANGED_EVENT, onScheduleSync);
    return () => window.removeEventListener(SCHEDULE_DATA_CHANGED_EVENT, onScheduleSync);
  }, [mutateTaskAlloc, mutateViewerTasks, mutatePersonalTasks]);

  const todayYmd = localCalendarYmd();
  const nowLabel = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const mergedForViewer = useMemo(() => {
    if (!viewerId) return [];
    const projectRows = allocations
      .filter((a) => memberIdEquals(a.member_id, viewerId))
      .map((a) => ({ raw: a, kind: 'project' }));
    const taskRows = taskAllocations
      .filter((a) => memberIdEquals(a.team_member_id, viewerId))
      .map((a) => ({ raw: a, kind: 'task' }));
    return [...taskRows, ...projectRows];
  }, [viewerId, allocations, taskAllocations]);

  const todayTaskRows = useMemo(() => {
    const today = todayYmd;
    const inRange = mergedForViewer.filter((item) => sliceDatesOverlapToday(item.raw, today));
    inRange.sort((a, b) =>
      String(a.raw.start_date || a.raw.task_start_date || '').localeCompare(
        String(b.raw.start_date || b.raw.task_start_date || '')
      )
    );

    const taskProjectIds = new Set(
      inRange
        .filter((x) => x.kind === 'task' && x.raw.project_id)
        .map((x) => String(x.raw.project_id).toLowerCase())
    );
    const visibleToday = inRange.filter(({ raw, kind }) => {
      if (kind !== 'project') return true;
      const pid = String(raw.project_id || '').toLowerCase();
      return !taskProjectIds.has(pid);
    });

    const baseRows = visibleToday.map(({ raw, kind }) => {
      const endForDelta = toYmd(raw.end_date) || toYmd(raw.task_end_date);
      const remaining = endForDelta ? businessDaysDelta(today, endForDelta) : null;
      const tone =
        remaining == null
          ? 'text-slate-500'
          : remaining < 0
            ? 'text-rose-600'
            : remaining <= 1
              ? 'text-amber-700'
              : 'text-slate-600';
      const remainingAbs = remaining == null ? null : Math.abs(remaining);
      const remainingWord = remaining == null ? '—' : remaining >= 0 ? '剩餘' : '逾期';

      const accentColor = raw.project_color || '#6366f1';
      const notesTrim = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : '';
      const title =
        kind === 'task'
          ? raw.task_name || '（未命名任務）'
          : notesTrim || raw.project_name || '（專案）';
      const subtitle =
        kind === 'task'
          ? `${raw.project_name || '—'} · ${String(raw.start_date || '').slice(0, 10)} → ${String(raw.end_date || '').slice(0, 10)}${raw.notes ? ` · ${raw.notes}` : ''}`
          : `${notesTrim ? `${raw.project_name || '—'} · ` : ''}專案甘特排程 · ${String(
              raw.start_date || ''
            ).slice(0, 10)} → ${String(raw.end_date || '').slice(0, 10)}${
              raw.project_client_name ? ` · ${raw.project_client_name}` : ''
            }${!notesTrim && raw.notes ? ` · ${raw.notes}` : ''}`;
      const badge = kind === 'task' ? raw.task_status || '—' : '排程';
      const href = raw.project_id ? `/projects/${raw.project_id}` : '/schedule';
      const s0 = toYmd(raw.start_date) || toYmd(raw.task_start_date);
      const e0 = toYmd(raw.end_date) || toYmd(raw.task_end_date);
      const progressPct = allocationProgressPct(s0, e0, today);

      return {
        key: `${kind}-${raw.id}`,
        kind,
        raw,
        projectId: raw.project_id || null,
        href,
        title,
        subtitle,
        accentColor,
        badge,
        progressPct,
        remainingTone: tone,
        remainingWord,
        remainingAbs,
      };
    });

    // 同一任務多筆時段重疊「今天」時只顯示一列；並讓 fallback 能辨識已出現的 task_id
    const dedupedTaskKeys = new Set();
    const dedupedBase = [];
    for (const row of baseRows) {
      if (row.kind === 'task' && row.raw?.task_id != null && row.projectId != null) {
        const k = `${String(row.projectId).toLowerCase()}|${String(row.raw.task_id).toLowerCase()}`;
        if (dedupedTaskKeys.has(k)) continue;
        dedupedTaskKeys.add(k);
      }
      dedupedBase.push(row);
    }

    const shownTaskIds = new Set(
      dedupedBase
        .filter((r) => r.kind === 'task' && r.raw?.task_id)
        .map((r) => String(r.raw.task_id).toLowerCase())
    );

    const extra = [];
    for (const t of viewerTasks) {
      if (!viewerTaskEligibleForTodayOverview(t, viewerId, today)) continue;
      if (shownTaskIds.has(String(t.id).toLowerCase())) continue;

      const endForDelta = toYmd(t.end_date);
      const remaining = endForDelta ? businessDaysDelta(today, endForDelta) : null;
      const remainingAbs = remaining == null ? null : Math.abs(remaining);
      const remainingWord = remaining == null ? '—' : remaining >= 0 ? '剩餘' : '逾期';
      const tone =
        remaining == null
          ? 'text-slate-500'
          : remaining < 0
            ? 'text-rose-600'
            : remaining <= 1
              ? 'text-amber-700'
              : 'text-slate-600';

      extra.push({
        key: `task-fallback-${t.id}`,
        kind: 'task',
        projectId: t.project_id || null,
        href: t.project_id ? `/projects/${t.project_id}#tasks` : '/tasks',
        title: t.name || '（未命名任務）',
        subtitle: '',
        accentColor: t.project_color || '#6366f1',
        badge: t.status || '—',
        progressPct: allocationProgressPct(t.start_date, t.end_date, today),
        remainingTone: tone,
        remainingWord,
        remainingAbs,
        raw: {
          id: `fallback-${t.id}`,
          task_id: t.id,
          team_member_id: viewerId,
          project_id: t.project_id,
          task_name: t.name,
          project_name: t.project_name,
          project_color: t.project_color,
          task_status: t.status,
          start_date: t.start_date,
          end_date: t.end_date,
          task_start_date: t.start_date,
          task_end_date: t.end_date,
          notes: null,
        },
      });
    }

    const combined = [...dedupedBase, ...extra];
    return combined.filter((row) => {
      if (row.kind !== 'task') return true;
      return memberIdEquals(row.raw?.team_member_id, viewerId);
    });
  }, [mergedForViewer, viewerTasks, todayYmd, viewerId]);

  /** 僅「目前檢視成員」今日任務列＋個人任務所屬專案（不含純專案甘特排程／其他人專案） */
  const viewerProjectSummaries = useMemo(() => {
    if (!viewerId) return [];
    const ids = new Set();
    const taskRowsToday = todayTaskRows.filter((r) => r.kind === 'task' && r.projectId);
    for (const row of taskRowsToday) {
      ids.add(String(row.projectId));
    }
    for (const t of personalTasks) {
      if (t.project_id) ids.add(String(t.project_id));
    }

    const list = [];
    for (const id of ids) {
      const full = projects.find((x) => String(x.id) === id);
      const fromTask = taskRowsToday.find((r) => String(r.projectId) === id);
      const fromPerson = personalTasks.find((t) => String(t.project_id) === id);
      const rawFb = fromTask?.raw;

      if (full) {
        list.push({
          id: full.id,
          name: full.name,
          color: full.color || '#6366f1',
          end_date: full.end_date,
          status: full.status,
          client_name: full.client_name,
        });
      } else if (rawFb?.project_id) {
        list.push({
          id: rawFb.project_id,
          name: rawFb.project_name || '專案',
          color: rawFb.project_color || '#6366f1',
          end_date: null,
          status: 'planning',
          client_name: null,
        });
      } else if (fromPerson) {
        list.push({
          id: fromPerson.project_id,
          name: fromPerson.project_name || '專案',
          color: fromPerson.project_color || '#6366f1',
          end_date: null,
          status: 'planning',
          client_name: null,
        });
      }
    }
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }, [viewerId, todayTaskRows, personalTasks, projects]);

  const todayTaskCount = todayTaskRows.filter((r) => r.kind === 'task').length;
  const projectCount = viewerProjectSummaries.length;

  if (loading) return <LoadingScreen />;

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-slate-900">
              {isMobileLayout ? '今日' : 'Dashboard'}
            </h1>
            <p className="mt-0.5 md:mt-1 text-xs md:text-sm text-slate-500">{nowLabel}</p>
          </div>
          {members.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-slate-500 w-full md:w-auto md:shrink-0">
              <span className="font-medium text-slate-600">檢視身分</span>
              <select
                value={viewerId ? String(viewerId) : ''}
                onChange={(e) => setViewerId(String(e.target.value))}
                className="rounded-xl md:rounded-lg border border-slate-200 bg-white px-3 py-2.5 md:py-2 text-sm text-slate-800 shadow-sm w-full md:min-w-[180px]"
              >
                {members.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                    {m.role ? ` · ${m.role}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {isMobileLayout && viewerId ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900 tabular-nums">
              今日任務 {todayTaskCount}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 tabular-nums">
              相關專案 {projectCount}
            </span>
          </div>
        ) : null}
      </div>

      {isMobileLayout ? (
        <>
          <DashboardProjectWidget
            key={viewerId || 'none'}
            viewerId={viewerId}
            projects={viewerProjectSummaries}
            todayAssignments={todayTaskRows.filter((r) => r.kind === 'task')}
            personalTasks={personalTasks}
            compact
          />
          <StudioVerticalSchedule
            projects={projects}
            allocations={allocations}
            members={members}
          />
        </>
      ) : (
        <>
          <div className="dashboard-tasks-region pt-3 min-h-0">
            <DashboardProjectWidget
              key={viewerId || 'none'}
              viewerId={viewerId}
              projects={viewerProjectSummaries}
              todayAssignments={todayTaskRows.filter((r) => r.kind === 'task')}
              personalTasks={personalTasks}
              inFrame
            />
          </div>
          <div className="dashboard-schedule-region pt-3">
            <section className="surface rounded-[22px] px-4 md:px-6 pt-4 pb-4 flex flex-col h-full min-h-0 overflow-hidden">
              <SchedulePanel title="工作時程" embedded />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-[360px] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-slate-700/60 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">載入中...</p>
      </div>
    </div>
  );
}
