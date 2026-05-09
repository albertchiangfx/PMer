'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import SchedulePanel from '../components/SchedulePanel';
import { addDays, eachDayOfInterval, isValid, isWeekend, parseISO } from 'date-fns';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [viewerId, setViewerId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getProjects(), api.getTeamMembers(), api.getInvoices(), api.getAllocations()])
      .then(([p, m, i, a]) => {
        setProjects(p);
        setMembers(m);
        setInvoices(i);
        setAllocations(a);
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => setLoading(false));
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

  if (loading) return <LoadingScreen />;

  const nowLabel = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const today = new Date().toISOString().slice(0, 10);
  const viewer = members.find((m) => String(m.id) === String(viewerId));
  const todaysAllocations = allocations
    .filter((a) => String(a.member_id || a.team_member_id || '') === String(viewerId))
    .filter((a) => a.start_date <= today && a.end_date >= today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  const firstUnnamedIdx = todaysAllocations.findIndex((a) => !a.task_name);

  // Remaining business days = endDate - TODAY - weekends (exclude today itself).
  const businessDaysDelta = (todayYmd, endYmd) => {
    if (!todayYmd || !endYmd) return null;
    const todayD = parseISO(todayYmd);
    const endD = parseISO(endYmd);
    if (!isValid(todayD) || !isValid(endD)) return null;

    // Exclude today from counting.
    if (endD.getTime() >= todayD.getTime()) {
      const start = addDays(todayD, 1);
      if (start.getTime() > endD.getTime()) return 0;
      const days = eachDayOfInterval({ start, end: endD });
      return days.filter((d) => !isWeekend(d)).length;
    }

    // Overdue: count weekdays in (end, today) excluding today.
    const start = addDays(endD, 1);
    const end = addDays(todayD, -1);
    if (start.getTime() > end.getTime()) return 0;
    const days = eachDayOfInterval({ start, end });
    return -days.filter((d) => !isWeekend(d)).length;
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">{nowLabel}</p>
        </div>
      </div>

      {/* Section 2: 登入者本日任務（以分配/Allocations 表示） */}
      <section className="mt-6 surface rounded-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 text-left">本日任務</h2>
          </div>
          <Link href="/tasks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition">
            所有任務
          </Link>
        </div>
        <div className="px-6 pb-6 pt-3">
          <div className="rounded-2xl bg-white/25 ring-1 ring-white/60 overflow-hidden">
            <div className="divide-y divide-white/40">
            {todaysAllocations.slice(0, 5).map((a, idx) => (
              (() => {
                const remaining = a.end_date ? businessDaysDelta(today, a.end_date) : null;
                const label = remaining == null ? '—' : remaining >= 0 ? `剩 ${remaining} 天` : `逾期 ${Math.abs(remaining)} 天`;
                const tone = remaining == null ? 'text-slate-500' : remaining < 0 ? 'text-rose-600' : remaining <= 1 ? 'text-amber-700' : 'text-slate-600';
                const remainingAbs = remaining == null ? null : Math.abs(remaining);
                const remainingWord = remaining == null ? '—' : remaining >= 0 ? '剩餘' : '逾期';
                const displayTaskName = a.task_name || (idx === firstUnnamedIdx ? 'GTO 戰鬥陀螺' : '（未命名）');
                const displayClientName =
                  a.project_client_name ||
                  a.client_name ||
                  (idx === firstUnnamedIdx ? '玩具反斗城' : '—');
                return (
                  <Link
                    key={a.id}
                    href={a.project_id ? `/projects/${a.project_id}` : '/schedule'}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-white/40 transition"
                  >
                    <div className={`w-[46px] shrink-0 flex flex-col items-center justify-center leading-none ${tone}`}>
                      <span className="text-[10px] font-semibold">{remainingWord}</span>
                      <span className="text-[18px] font-bold tabular-nums mt-0.5">{remainingAbs ?? '—'}</span>
                      <span className="text-[10px] font-semibold mt-0.5">天</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {displayTaskName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {displayClientName} · {String(a.start_date || '').slice(0, 10)} → {String(a.end_date || '').slice(0, 10)}
                        {a.notes ? ` · ${a.notes}` : ''}
                      </p>
                    </div>
                  </Link>
                );
              })()
            ))}
            </div>
            {viewerId && todaysAllocations.length === 0 && <EmptyState text="今天沒有分配任務" />}
            {!viewerId && <EmptyState text="請先選擇成員" />}
          </div>
        </div>
      </section>

      {/* Schedule content moved here from /schedule */}
      <section className="mt-6 surface rounded-[22px] px-6 pt-6 pb-6">
        <SchedulePanel title="工作時程" />
      </section>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="py-8 text-center text-sm text-slate-400">{text}</div>;
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

function SoftStatCard({ label, value, sub, accent }) {
  const right = accent === 'warn'
    ? 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-200/60'
    : 'bg-slate-900/5 text-slate-700 ring-1 ring-white/60';

  return (
    <div className="rounded-[22px] bg-white/45 ring-1 ring-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_20px_50px_rgba(15,23,42,0.07)] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{sub}</p>
        </div>
        <div className={`h-10 w-10 rounded-2xl grid place-items-center ${right}`}>
          <IconSpark />
        </div>
      </div>
    </div>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 2l1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2Z" />
      <path d="M19 14l.9 2.8L23 18l-3.1 1.2L19 22l-.9-2.8L15 18l3.1-1.2L19 14Z" opacity=".6" />
    </svg>
  );
}
