'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { addDays, differenceInCalendarDays, eachDayOfInterval, isValid, isWeekend, parseISO } from 'date-fns';
import { api } from '../lib/api';
import SchedulePanel from '../components/SchedulePanel';
import DashboardProjectWidget from '../components/DashboardProjectWidget';
import { SCHEDULE_DATA_CHANGED_EVENT } from '../lib/dashboard-sync';

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

/** Whether allocation / time block overlaps local-calendar `todayYmd`. */
function allocationOverlapsToday(raw, todayYmd) {
  let start = toYmd(raw?.start_date);
  let end = toYmd(raw?.end_date);
  const tStart = toYmd(raw?.task_start_date);
  const tEnd = toYmd(raw?.task_end_date);
  if (!start && tStart) start = tStart;
  if (!end && tEnd) end = tEnd;
  if (!start && !end) return false;
  if (start && end) return start <= todayYmd && end >= todayYmd;
  if (start && !end) return start <= todayYmd;
  if (!start && end) return end >= todayYmd;
  return false;
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

export default function Dashboard() {
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [taskAllocations, setTaskAllocations] = useState([]);
  const [viewerId, setViewerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataTick, setDataTick] = useState(0);
  const [viewerTasks, setViewerTasks] = useState([]);

  const loadCore = useCallback(async () => {
    const [m, a, p] = await Promise.all([api.getTeamMembers(), api.getAllocations(), api.getProjects()]);
    setMembers(m);
    setAllocations(Array.isArray(a) ? a : []);
    setProjects(Array.isArray(p) ? p : []);
  }, []);

  useEffect(() => {
    const onScheduleSync = () => setDataTick((t) => t + 1);
    window.addEventListener(SCHEDULE_DATA_CHANGED_EVENT, onScheduleSync);
    return () => window.removeEventListener(SCHEDULE_DATA_CHANGED_EVENT, onScheduleSync);
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

    const idEquals = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

    // 已選的人若不在名單內（被刪除等）→ 改選仍在的成員
    if (viewerId && !members.some((m) => idEquals(m.id, viewerId))) {
      const firstActive = members.find((m) => m.status === 'active') || members[0];
      if (firstActive) setViewerId(String(firstActive.id));
      return;
    }

    // 尚未選人時才自動帶入；選定後 members 再 refetch 不會覆寫下拉（避免 hot swap 無效）
    if (viewerId) return;

    try {
      const saved = localStorage.getItem('sp.viewerMemberId');
      if (saved) {
        const found = members.find((m) => idEquals(m.id, saved));
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
    const viewer = members.find((m) => String(m.id) === String(viewerId));
    if (!viewer) return;
    try {
      localStorage.setItem('sp.viewerMemberName', viewer.name || '');
      localStorage.setItem('sp.viewerMemberRole', viewer.role || '');
    } catch {
      // ignore
    }
  }, [viewerId, members]);

  useEffect(() => {
    if (!viewerId) {
      setTaskAllocations([]);
      return;
    }
    let cancelled = false;
    api
      .getTimeAllocations({ team_member_id: viewerId })
      .then((rows) => {
        if (!cancelled) setTaskAllocations(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setTaskAllocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId, dataTick]);

  useEffect(() => {
    if (!viewerId) {
      setViewerTasks([]);
      return;
    }
    let cancelled = false;
    api
      .getTasks({ team_member_id: viewerId })
      .then((rows) => {
        if (!cancelled) setViewerTasks(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setViewerTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId, dataTick]);

  const todayYmd = localCalendarYmd();
  const nowLabel = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const mergedForViewer = useMemo(() => {
    if (!viewerId) return [];
    const pid = String(viewerId);
    const projectRows = allocations
      .filter((a) => String(a.member_id || '') === pid)
      .map((a) => ({ raw: a, kind: 'project' }));
    const taskRows = taskAllocations.map((a) => ({ raw: a, kind: 'task' }));
    return [...taskRows, ...projectRows];
  }, [viewerId, allocations, taskAllocations]);

  const todayTaskRows = useMemo(() => {
    const today = todayYmd;
    const inRange = mergedForViewer.filter((item) => allocationOverlapsToday(item.raw, today));
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
        remaining == null ? 'text-slate-500' : remaining < 0 ? 'text-rose-600' : remaining <= 1 ? 'text-amber-700' : 'text-slate-600';
      const remainingAbs = remaining == null ? null : Math.abs(remaining);
      const remainingWord = remaining == null ? '—' : remaining >= 0 ? '剩餘' : '逾期';

      const accentColor = raw.project_color || '#6366f1';
      const notesTrim =
        typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : '';
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
      if (!allocationOverlapsToday({ start_date: t.start_date, end_date: t.end_date }, today)) continue;
      if (shownTaskIds.has(String(t.id))) continue;

      const endForDelta = toYmd(t.end_date);
      const remaining = endForDelta ? businessDaysDelta(today, endForDelta) : null;
      const remainingAbs = remaining == null ? null : Math.abs(remaining);
      const remainingWord = remaining == null ? '—' : remaining >= 0 ? '剩餘' : '逾期';
      const tone =
        remaining == null ? 'text-slate-500' : remaining < 0 ? 'text-rose-600' : remaining <= 1 ? 'text-amber-700' : 'text-slate-600';

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

    return [...dedupedBase, ...extra];
  }, [mergedForViewer, viewerTasks, todayYmd]);

  /** 與 Tasks overview 共用，避免 widget 再打一隻 API */
  const { data: personalTasks = [] } = useSWR(
    viewerId ? ['personal-tasks', viewerId] : null,
    () => api.getPersonalTasks({ member_id: viewerId })
  );

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

  if (loading) return <LoadingScreen />;

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">{nowLabel}</p>
        </div>
        {members.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-slate-500 shrink-0">
            <span className="font-medium text-slate-600">檢視身分</span>
            <select
              value={viewerId ? String(viewerId) : ''}
              onChange={(e) => setViewerId(String(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm min-w-[180px]"
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

      <DashboardProjectWidget
        key={viewerId || 'none'}
        viewerId={viewerId}
        projects={viewerProjectSummaries}
        todayAssignments={todayTaskRows.filter((r) => r.kind === 'task')}
        personalTasks={personalTasks}
      />

      <section className="mt-6 surface rounded-[22px] px-6 pt-6 pb-6">
        <SchedulePanel title="工作時程" />
      </section>
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
