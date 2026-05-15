'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackToDashboard from '../../components/BackToDashboard';
import { api } from '../../lib/api';
import { SCHEDULE_DATA_CHANGED_EVENT } from '../../lib/dashboard-sync';

function fmtYmd(d) {
  if (!d) return '—';
  try {
    return String(d).slice(0, 10);
  } catch {
    return '—';
  }
}

export default function MyTasksPage() {
  const [viewerId, setViewerId] = useState('');
  const [members, setMembers] = useState([]);
  /** Merged: task-level time_allocations + project-level allocations (same as dashboard / Gantt). */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    const onScheduleSync = () => setSyncTick((t) => t + 1);
    window.addEventListener(SCHEDULE_DATA_CHANGED_EVENT, onScheduleSync);
    return () => window.removeEventListener(SCHEDULE_DATA_CHANGED_EVENT, onScheduleSync);
  }, []);

  useEffect(() => {
    api
      .getTeamMembers({ status: 'active' })
      .then((m) => setMembers(m))
      .catch((e) => console.error(e));
  }, []);

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
    setViewerId(String(members[0].id));
  }, [members]);

  useEffect(() => {
    if (!viewerId) return;
    setLoading(true);
    Promise.all([
      api.getTimeAllocations({ team_member_id: viewerId }).catch((e) => {
        console.error(e);
        return [];
      }),
      api.getAllocations({ member_id: viewerId }).catch((e) => {
        console.error(e);
        return [];
      }),
    ])
      .then(([taskAllocRows, projectAllocRows]) => {
        const ta = Array.isArray(taskAllocRows) ? taskAllocRows : [];
        const pa = Array.isArray(projectAllocRows) ? projectAllocRows : [];
        const merged = [
          ...ta.map((a) => ({ ...a, _rowKind: 'task' })),
          ...pa.map((a) => ({ ...a, _rowKind: 'project' })),
        ];
        merged.sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')));
        setRows(merged);
      })
      .finally(() => setLoading(false));
  }, [viewerId, syncTick]);

  const viewer = useMemo(
    () => members.find((m) => String(m.id) === String(viewerId)),
    [members, viewerId]
  );

  return (
    <div className="p-8 animate-fade-in">
      <BackToDashboard className="mb-4" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            所有任務
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {viewer ? `${viewer.name} (${viewer.role || '—'})` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-6 surface rounded-[22px] p-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">目前沒有任務</div>
        ) : (
          <div className="rounded-2xl bg-white/25 ring-1 ring-white/60 overflow-hidden">
            <div className="divide-y divide-white/40">
              {rows.map((a) => (
                <Link
                  key={a._rowKind === 'task' ? `t-${a.id}` : `p-${a.id}`}
                  href={a.project_id ? `/projects/${a.project_id}` : '/projects'}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-white/40 transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {a._rowKind === 'task'
                        ? a.task_name || '（未命名任務）'
                        : a.project_name || '（專案）'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {a._rowKind === 'task'
                        ? `${a.project_name || '—'} · ${fmtYmd(a.start_date)} → ${fmtYmd(a.end_date)}`
                        : `專案甘特排程 · ${fmtYmd(a.start_date)} → ${fmtYmd(a.end_date)}${
                            a.project_client_name ? ` · ${a.project_client_name}` : ''
                          }${a.notes ? ` · ${a.notes}` : ''}`}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold whitespace-nowrap text-slate-600">
                    {a._rowKind === 'task' ? a.task_status || '—' : '排程'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
