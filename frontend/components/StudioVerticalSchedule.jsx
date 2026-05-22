'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  getDay,
  isToday,
  isValid,
  isWeekend,
  parseISO,
  startOfWeek,
} from 'date-fns';
import {
  DEFAULT_HOLIDAY_COUNTRIES,
  holidayTooltip,
  loadHolidayIndex,
} from '../lib/public-holidays';

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_ROW_H = 18;
const WEEK_ROW_H = 22;
const LANE_W = 28;
const DATE_COL_W = 56;
const MAX_DAY_ROWS = 120;

function ymd(d) {
  if (!d) return '';
  if (d instanceof Date && isValid(d)) return format(d, 'yyyy-MM-dd');
  return String(d).slice(0, 10);
}

function parseYmd(s) {
  if (!s) return null;
  const p = parseISO(String(s).slice(0, 10));
  return isValid(p) ? p : null;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function spanHasWeekend(start, end) {
  let d = start;
  while (d <= end) {
    if (isWeekend(d)) return true;
    d = addDays(d, 1);
  }
  return false;
}

function spanHasHoliday(start, end, holidayYmdSet) {
  let d = start;
  while (d <= end) {
    const key = ymd(d);
    if (!isWeekend(d) && holidayYmdSet.has(key)) return true;
    d = addDays(d, 1);
  }
  return false;
}

function rowSurfaceClass({ stripeIdx, wknd, hol, selected, today_ }) {
  if (selected) return 'bg-indigo-100 ring-2 ring-inset ring-indigo-400';
  if (today_) return 'ring-1 ring-inset ring-indigo-300';
  if (wknd) return 'gantt-weekend';
  if (hol) return 'gantt-holiday';
  return stripeIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90';
}

function shortColumnLabel(name, max = 3) {
  const raw = String(name || '').trim();
  if (!raw) return '—';
  if (raw.length <= max) return raw;
  return raw.slice(0, max);
}

function getProjectSpan(project, projectAllocations) {
  if (project?.start_date && project?.end_date) {
    const s = parseYmd(project.start_date);
    const e = parseYmd(project.end_date);
    if (s && e && e >= s) return { start: s, end: e };
  }
  const valid = (projectAllocations || []).filter((a) => a.start_date && a.end_date);
  if (!valid.length) return { start: null, end: null };
  let minS = parseYmd(valid[0].start_date);
  let maxE = parseYmd(valid[0].end_date);
  for (const a of valid) {
    const s = parseYmd(a.start_date);
    const e = parseYmd(a.end_date);
    if (s && (!minS || s < minS)) minS = s;
    if (e && (!maxE || e > maxE)) maxE = e;
  }
  return minS && maxE && maxE >= minS ? { start: minS, end: maxE } : { start: null, end: null };
}

function allocMemberId(a) {
  return a?.member_id ?? a?.team_member_id;
}

/**
 * 手機直式：全工作室時程。欄 = 專案或成員，列 = 日期（由上往下）。
 */
export default function StudioVerticalSchedule({
  projects = [],
  allocations = [],
  members = [],
  title = '工作時程',
  showDesktopLink = true,
}) {
  const scrollRef = useRef(null);
  const todayRowRef = useRef(null);
  const [mode, setMode] = useState('projects');
  const [focusedRowKey, setFocusedRowKey] = useState(null);
  const [holidayYmdSet, setHolidayYmdSet] = useState(() => new Set());
  const [holidayByDate, setHolidayByDate] = useState(() => new Map());

  const allocsByProject = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const pid = String(a.project_id || '').toLowerCase();
      if (!pid) continue;
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid).push(a);
    }
    return m;
  }, [allocations]);

  const allocsByMember = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const mid = String(allocMemberId(a) || '').toLowerCase();
      if (!mid) continue;
      if (!m.has(mid)) m.set(mid, []);
      m.get(mid).push(a);
    }
    return m;
  }, [allocations]);

  const projectColumns = useMemo(() => {
    return projects
      .map((p) => {
        const idLc = String(p.id).toLowerCase();
        const span = getProjectSpan(p, allocsByProject.get(idLc) || []);
        return { id: p.id, label: p.name, color: p.color || '#6366f1', span, href: `/projects/${p.id}` };
      })
      .filter((c) => c.span.start && c.span.end)
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [projects, allocsByProject]);

  const memberColumns = useMemo(() => {
    const cols = [];
    for (const m of members) {
      const idLc = String(m.id).toLowerCase();
      const list = allocsByMember.get(idLc) || [];
      if (!list.length) continue;
      let minS = null;
      let maxE = null;
      for (const a of list) {
        const s = parseYmd(a.start_date);
        const e = parseYmd(a.end_date);
        if (s && (!minS || s < minS)) minS = s;
        if (e && (!maxE || e > maxE)) maxE = e;
      }
      if (!minS || !maxE) continue;
      cols.push({
        id: m.id,
        label: m.name,
        color: m.avatar_color || '#6366f1',
        span: { start: minS, end: maxE },
        allocs: list,
        href: '/team',
      });
    }
    return cols.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [members, allocsByMember]);

  const columns = mode === 'projects' ? projectColumns : memberColumns;

  const range = useMemo(() => {
    if (!columns.length) return null;
    let min = columns[0].span.start;
    let max = columns[0].span.end;
    for (const c of columns) {
      if (c.span.start < min) min = c.span.start;
      if (c.span.end > max) max = c.span.end;
    }
    return { start: min, end: max };
  }, [columns]);

  useEffect(() => {
    if (!range) {
      setHolidayYmdSet(new Set());
      setHolidayByDate(new Map());
      return undefined;
    }
    let cancelled = false;
    loadHolidayIndex(ymd(range.start), ymd(range.end), DEFAULT_HOLIDAY_COUNTRIES)
      .then(({ dateSet, byDate }) => {
        if (!cancelled) {
          setHolidayYmdSet(dateSet);
          setHolidayByDate(byDate);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHolidayYmdSet(new Set());
          setHolidayByDate(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range?.start?.getTime(), range?.end?.getTime()]);

  const useWeekRows = useMemo(() => {
    if (!range) return false;
    return differenceInCalendarDays(range.end, range.start) + 1 > MAX_DAY_ROWS;
  }, [range]);

  const timeRows = useMemo(() => {
    if (!range) return [];
    const { start: pStart, end: pEnd } = range;
    const base = !useWeekRows
      ? eachDayOfInterval({ start: pStart, end: pEnd }).map((day) => ({
          kind: 'day',
          start: day,
          end: day,
          key: ymd(day),
        }))
      : (() => {
          const rows = [];
          let cur = startOfWeek(pStart, { weekStartsOn: 1 });
          while (cur <= pEnd) {
            const wEnd = endOfWeek(cur, { weekStartsOn: 1 });
            const start = cur < pStart ? pStart : cur;
            const end = wEnd > pEnd ? pEnd : wEnd;
            rows.push({ kind: 'week', start, end, key: `w-${ymd(start)}` });
            cur = addDays(wEnd, 1);
          }
          return rows;
        })();
    return base;
  }, [range, useWeekRows]);

  const laneCount = columns.length;
  const gridCols =
    laneCount > 0
      ? `${DATE_COL_W}px repeat(${laneCount}, minmax(${LANE_W}px, 1fr))`
      : `${DATE_COL_W}px`;
  const rowH = useWeekRows ? WEEK_ROW_H : DAY_ROW_H;
  const periodLabel = range
    ? `${format(range.start, 'M/d')} — ${format(range.end, 'M/d')}`
    : '';

  useEffect(() => {
    const el = scrollRef.current;
    const row = todayRowRef.current;
    if (!el || !row) return;
    const t = window.setTimeout(() => {
      el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight * 0.35);
    }, 80);
    return () => window.clearTimeout(t);
  }, [timeRows.length, mode]);

  const isActive = (col, row) => {
    if (mode === 'projects') {
      return rangesOverlap(row.start, row.end, col.span.start, col.span.end);
    }
    return col.allocs.some((a) => {
      const s = parseYmd(a.start_date);
      const e = parseYmd(a.end_date);
      if (!s || !e) return false;
      return rangesOverlap(row.start, row.end, s, e);
    });
  };

  return (
    <section className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {showDesktopLink ? (
          <Link href="/schedule" className="text-xs font-semibold text-indigo-600 shrink-0 md:hidden">
            電腦版甘特 →
          </Link>
        ) : null}
      </div>

      <div className="flex gap-0.5 p-0.5 bg-white rounded-xl border border-slate-200/90 shadow-sm w-full max-w-md">
        {[
          ['projects', '依專案'],
          ['members', '依成員'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setMode(k);
              setFocusedRowKey(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === k ? 'bg-indigo-600 text-white' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {periodLabel ? (
        <p className="text-[10px] text-slate-500 tabular-nums px-0.5">
          工作室區間 {periodLabel}
          {useWeekRows ? ' · 每列一週' : ' · 每列一日'}
        </p>
      ) : null}

      {!columns.length ? (
        <div className="surface rounded-xl border border-slate-200/80 p-3 text-sm text-slate-500">
          {mode === 'projects'
            ? '尚無可顯示的專案時程（請設定專案起訖或成員分配）。'
            : '尚無成員時間分配。'}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-200/80 bg-white">
          <div
            ref={scrollRef}
            className="w-full overflow-y-auto overflow-x-hidden overscroll-contain max-h-[min(52vh,480px)]"
          >
            <div className="w-full min-w-0">
              <div
                className="sticky top-0 z-20 grid w-full border-b border-slate-200 bg-slate-50"
                style={{ gridTemplateColumns: gridCols, minHeight: rowH + 4 }}
              >
                <div className="border-r border-slate-200 text-[10px] font-semibold text-slate-500 flex items-center justify-end pr-1.5">
                  日期
                </div>
                {columns.map((col) => (
                  <Link
                    key={col.id}
                    href={col.href}
                    className="flex items-center justify-center min-w-0 px-0.5 border-l border-slate-100 first:border-l-0 active:bg-slate-100/80"
                    title={col.label}
                  >
                    <span
                      className="text-[10px] font-bold leading-none text-center text-slate-800 truncate w-full"
                      style={{ maxWidth: '100%' }}
                    >
                      {shortColumnLabel(col.label, mode === 'members' ? 2 : 3)}
                    </span>
                  </Link>
                ))}
              </div>

              {timeRows.map((row, stripeIdx) => {
                const isDay = row.kind === 'day';
                const day = isDay ? row.start : null;
                const wknd = isDay ? isWeekend(day) : spanHasWeekend(row.start, row.end);
                const hol =
                  isDay && day
                    ? !wknd && holidayYmdSet.has(ymd(day))
                    : spanHasHoliday(row.start, row.end, holidayYmdSet);
                const today_ = isDay && day && isToday(day);
                const selected = focusedRowKey === row.key;
                const surface = rowSurfaceClass({ stripeIdx, wknd, hol, selected, today_ });

                const dateLabel = isDay ? (
                  <span className="tabular-nums">
                    <span className="font-semibold text-slate-800">{format(day, 'M/d')}</span>
                    <span className="text-slate-400 ml-0.5">{WEEKDAYS_ZH[getDay(day)]}</span>
                  </span>
                ) : (
                  <span className="tabular-nums text-[10px] font-medium text-slate-700">
                    {format(row.start, 'M/d')}–{format(row.end, 'M/d')}
                  </span>
                );

                const holTitle =
                  isDay && hol ? holidayTooltip(ymd(day), holidayByDate) : undefined;

                return (
                  <button
                    key={row.key}
                    ref={today_ ? todayRowRef : undefined}
                    type="button"
                    aria-pressed={selected}
                    className={`grid w-full border-b border-slate-100/90 text-left transition-colors ${surface}`}
                    style={{ gridTemplateColumns: gridCols, minHeight: rowH }}
                    title={holTitle}
                    onClick={() =>
                      setFocusedRowKey((k) => (k === row.key ? null : row.key))
                    }
                  >
                    <span className="sticky left-0 z-[1] border-r border-slate-100/80 flex items-center justify-end pr-1.5 text-[10px]">
                      {dateLabel}
                    </span>
                    {columns.map((col) => {
                      const active = isActive(col, row);
                      return (
                        <span
                          key={col.id}
                          className="border-l border-slate-100/60 first:border-l-0"
                          style={{
                            backgroundColor: active ? col.color : 'transparent',
                            opacity: active ? 0.82 : 1,
                          }}
                          title={active ? col.label : undefined}
                        />
                      );
                    })}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {columns.length > 0 ? (
        <ul className="space-y-1 px-0.5">
          {columns.map((col) => (
            <li key={col.id} className="flex items-center gap-2 text-[11px] text-slate-600 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white shadow-sm"
                style={{ backgroundColor: col.color }}
              />
              <Link href={col.href} className="truncate font-medium text-slate-800 hover:text-indigo-600">
                {col.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-[10px] text-slate-500 px-0.5 leading-relaxed">
        週末／國定假日整列著色；點列可標示該日。單一專案細節請進專案頁「時程預覽」。
      </p>
    </section>
  );
}
