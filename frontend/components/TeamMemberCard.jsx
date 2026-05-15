'use client';
import { fmtCurrency, initials } from '../lib/utils';

export default function TeamMemberCard({ member, onEdit }) {
  const ini = initials(member.name);
  const bg = member.avatar_color || '#6366f1';
  const isFreelance = member.employment_type === 'freelance';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit?.(member)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit?.(member);
        }
      }}
      className="surface rounded-[22px] p-5 surface-hover transition group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
    >
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-base font-bold shrink-0 shadow-[0_12px_24px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.35)]"
          style={{ backgroundColor: bg }}
        >
          {ini}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">{member.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{member.role}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium
                ${member.status === 'active' ? 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-200/60' : 'bg-slate-900/5 text-slate-600 ring-1 ring-white/60'}`}
              >
                {member.status}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium
                ${isFreelance ? 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-200/60' : 'bg-indigo-500/15 text-indigo-700 ring-1 ring-indigo-200/60'}`}
              >
                {isFreelance ? 'Freelance' : '固定'}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/35 ring-1 ring-white/60 p-2.5 inset-highlight">
              <p className="text-[10px] text-slate-500">時薪</p>
              <p className="text-sm font-semibold text-slate-900">
                {fmtCurrency(member.hourly_rate)}/h
              </p>
            </div>
            <div className="rounded-2xl bg-white/35 ring-1 ring-white/60 p-2.5 inset-highlight">
              <p className="text-[10px] text-slate-500">進行中</p>
              <p className="text-sm font-semibold text-slate-900">
                {member.active_allocations || 0} 任務
              </p>
            </div>
          </div>

          {(member.email || member.phone) && (
            <div className="mt-3 space-y-1">
              {member.email && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span className="truncate">{member.email}</span>
                </div>
              )}
              {member.phone && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.18 2 2 0 012.12 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <span>{member.phone}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Click anywhere on the card to edit. The card itself is the button —
          delete now lives inside the edit modal behind the lock toggle. */}
    </div>
  );
}
