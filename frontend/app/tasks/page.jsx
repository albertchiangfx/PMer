'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackToDashboard from '../../components/BackToDashboard';
import { api } from '../../lib/api';

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
  const [allocs, setAllocs] = useState([]);
  const [loading, setLoading] = useState(true);

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
    api
      .getTimeAllocations({ team_member_id: viewerId })
      .then((rows) => setAllocs(Array.isArray(rows) ? rows : []))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [viewerId]);

  const viewer = useMemo(() => members.find((m) => String(m.id) === String(viewerId)), [members, viewerId]);

  const rows = useMemo(() => {
    const list = [...allocs];
    list.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
    return list;
  }, [allocs]);

  return (
    <div className="p-8 animate-fade-in">
      <BackToDashboard className="mb-4" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">所有任務</h1>
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
                  key={a.id}
                  href={a.project_id ? `/projects/${a.project_id}` : '/projects'}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-white/40 transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {a.task_name || '（未命名任務）'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {a.project_name || '—'} · {fmtYmd(a.start_date)} → {fmtYmd(a.end_date)}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold whitespace-nowrap text-slate-600">
                    {a.task_status || '—'}
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

