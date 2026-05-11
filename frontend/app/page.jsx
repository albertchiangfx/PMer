'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, eachDayOfInterval, isValid, isWeekend, parseISO } from 'date-fns';
import { api } from '../lib/api';
import SchedulePanel from '../components/SchedulePanel';
import DashboardProjectWidget from '../components/DashboardProjectWidget';
import { SCHEDULE_DATA_CHANGED_EVENT } from '../lib/dashboard-sync';

function allocationProgressPct(startYmd, endYmd, todayYmd) {
  try {
    const s = parseISO(startYmd);
    const e = parseISO(endYmd);
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
    try {
      const saved = localStorage.getItem('sp.viewerMemberId');
      if (saved && members.some((m) => String(m.id) === String(saved))) {
        setViewerId(String(saved));
        return;
      }
    } catch {
      // ignore
    }
    const firstActive = members.find((m) => m.status === 'active') || members[0];
    if (firstActive) setViewerId(String(firstActive.id));
  }, [members]);

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

  const today = new Date().toISOString().slice(0, 10);
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
    const inRange = mergedForViewer.filter(
      (item) => item.raw.start_date <= today && item.raw.end_date >= today
    );
    inRange.sort((a, b) => String(a.raw.start_date).localeCompare(String(b.raw.start_date)));

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

    return visibleToday.map(({ raw, kind }) => {
      const remaining = raw.end_date ? businessDaysDelta(today, raw.end_date) : null;
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
      const progressPct = allocationProgressPct(raw.start_date, raw.end_date, today);

      return {
        key: `${kind}-${raw.id}`,
        kind,
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
  }, [mergedForViewer, today]);

  const viewerProjectSummaries = useMemo(() => {
    if (!viewerId) return [];
    const ids = new Set();
    for (const { raw } of mergedForViewer) {
      if (raw.project_id) ids.add(String(raw.project_id));
    }
    const list = [];
    for (const id of ids) {
      const full = projects.find((x) => String(x.id) === id);
      const fallback = mergedForViewer.find((m) => String(m.raw.project_id) === id)?.raw;
      if (full) {
        list.push({
          id: full.id,
          name: full.name,
          color: full.color || '#6366f1',
          end_date: full.end_date,
          status: full.status,
          client_name: full.client_name,
        });
      } else if (fallback?.project_id) {
        list.push({
          id: fallback.project_id,
          name: fallback.project_name || '專案',
          color: fallback.project_color || '#6366f1',
          end_date: null,
          status: 'planning',
          client_name: fallback.project_client_name,
        });
      }
    }
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }, [viewerId, mergedForViewer, projects]);

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
              value={viewerId}
              onChange={(e) => setViewerId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm min-w-[180px]"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.role ? ` · ${m.role}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <DashboardProjectWidget
        viewerId={viewerId}
        projects={viewerProjectSummaries}
        todayAssignments={todayTaskRows}
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
