'use client';

import Link from 'next/link';

/**
 * Dashboard 「本日任務」— 視覺參考 elegant-widget.jsx（暖色分隔線、色點、細進度條）。
 * `rows` 由 Dashboard 從 allocations + time_allocations 合併後傳入。
 */
export default function DashboardTodayTasks({ rows, viewerId }) {
  return (
    <section className="mt-6 surface rounded-[22px] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: "Georgia, 'Noto Serif TC', serif" }}
          >
            本日任務
          </h2>
          <p className="mt-1 text-[11px] text-stone-500 tracking-wide">
            與下方工作時程即時同步 · 含甘特排程與任務級分配
          </p>
        </div>
        <Link href="/tasks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition shrink-0">
          所有任務
        </Link>
      </div>

      <div className="px-6 pb-6 pt-4">
        {rows.length > 0 ? (
          <div className="rounded-2xl bg-white/25 ring-1 ring-white/60 overflow-hidden divide-y divide-stone-200/75">
            {rows.slice(0, 8).map((row) => (
              <Link
                key={row.key}
                href={row.href}
                className="grid grid-cols-[52px_1fr_auto] gap-3 sm:gap-4 items-center px-4 py-3.5 hover:bg-white/45 transition text-left"
              >
                <div className={`flex flex-col items-center justify-center leading-none shrink-0 ${row.remainingTone}`}>
                  <span className="text-[10px] font-semibold">{row.remainingWord}</span>
                  <span className="text-[17px] font-bold tabular-nums mt-0.5">{row.remainingAbs ?? '—'}</span>
                  <span className="text-[10px] font-semibold mt-0.5">天</span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: row.accentColor }}
                      aria-hidden
                    />
                    <p
                      className="text-sm font-semibold text-slate-900 truncate"
                      style={{ fontFamily: "'Noto Sans TC', ui-sans-serif, system-ui, sans-serif" }}
                    >
                      {row.title}
                    </p>
                  </div>
                  <div className="h-0.5 rounded-full bg-stone-200/90 overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${row.progressPct}%`, backgroundColor: row.accentColor, opacity: 0.85 }}
                    />
                  </div>
                  <p className="text-xs text-stone-500 truncate">{row.subtitle}</p>
                </div>

                <span className="text-[11px] font-semibold text-stone-400 whitespace-nowrap text-right hidden sm:block">
                  {row.badge}
                </span>
              </Link>
            ))}
          </div>
        ) : viewerId ? (
          <div className="py-10 text-center text-sm text-stone-400">今天沒有分配任務</div>
        ) : (
          <div className="py-10 text-center text-sm text-stone-400">請先選擇成員（由工作時程或設定）</div>
        )}
      </div>
    </section>
  );
}
