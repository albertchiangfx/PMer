'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
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
import { api } from '../lib/api';
import { buildMilestoneSegments } from '../lib/milestone-segments';
import { nodeKindMeta } from '../lib/timeline-detail-nodes';
import {
  holidayTooltip,
  loadEnabledHolidayCountries,
  loadHolidayIndex,
} from '../lib/public-holidays';

const MILESTONE_COLORS = [
  '#c7d2fe',
  '#bae6fd',
  '#a7f3d0',
  '#fde68a',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
];

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_ROW_H = 18;
const WEEK_ROW_H = 22;
const LANE_W = 28;
const DATE_COL_W = 56;
const MAX_DAY_ROWS = 100;

/** 手機直式欄標題縮寫（完整名稱保留在 title / 下方圖例） */
const MILESTONE_SHORT_EXACT = {
  moodboard: 'MB',
  previz: 'PV',
  styleframe: 'SF',
  'final delivery': 'FD',
  briefing: 'BR',
  review: 'RV',
};

function shortMilestoneLabel(label) {
  const raw = String(label || '').trim();
  if (!raw) return '—';
  const key = raw.toLowerCase();
  if (MILESTONE_SHORT_EXACT[key]) return MILESTONE_SHORT_EXACT[key];

  const fe = /^final\s+edit\s+(\d+)\s*$/i.exec(raw);
  if (fe) return `FE${fe[1].padStart(2, '0')}`;

  if (/^[\x00-\x7F]+$/.test(raw)) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return words
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 4);
    }
    if (raw.length <= 4) return raw;
    return raw.slice(0, 3);
  }

  if (raw.length <= 3) return raw;
  return raw.slice(0, 2);
}

function ymd(d) {
  if (!d) return '';
  if (d instanceof Date && isValid(d)) return format(d, 'yyyy-MM-dd');
  return String(d).slice(0, 10);
}

function parseYmd(s) {
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

export default function ProjectScheduleVerticalTimeline({ projectId, project, embedded = false }) {
  const scrollRef = useRef(null);
  const todayRowRef = useRef(null);
  const [focusedRowKey, setFocusedRowKey] = useState(null);

  const { data: milestones = [], isLoading } = useSWR(
    projectId ? ['project-milestones', projectId] : null,
    () => api.getProjectMilestones(projectId)
  );

  const segments = useMemo(
    () => buildMilestoneSegments(project, milestones),
    [project, milestones]
  );

  const [holidayYmdSet, setHolidayYmdSet] = useState(() => new Set());
  const [holidayByDate, setHolidayByDate] = useState(() => new Map());

  const pStart = useMemo(
    () => (project?.start_date ? parseYmd(project.start_date) : null),
    [project?.start_date]
  );
  const pEnd = useMemo(
    () => (project?.end_date ? parseYmd(project.end_date) : null),
    [project?.end_date]
  );

  useEffect(() => {
    if (!pStart || !pEnd) {
      setHolidayYmdSet(new Set());
      setHolidayByDate(new Map());
      return undefined;
    }
    let cancelled = false;
    const codes = loadEnabledHolidayCountries(projectId);
    loadHolidayIndex(project.start_date, project.end_date, codes)
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
  }, [projectId, project?.start_date, project?.end_date, pStart, pEnd]);

  const useWeekRows = useMemo(() => {
    if (!pStart || !pEnd) return false;
    return differenceInCalendarDays(pEnd, pStart) + 1 > MAX_DAY_ROWS;
  }, [pStart, pEnd]);

  const timeRows = useMemo(() => {
    if (!pStart || !pEnd || pEnd < pStart) return [];
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
            rows.push({
              kind: 'week',
              start,
              end,
              key: `w-${ymd(start)}`,
            });
            cur = addDays(wEnd, 1);
          }
          return rows;
        })();

    return base;
  }, [pStart, pEnd, useWeekRows]);

  const nodesBySegDate = useMemo(() => {
    const m = new Map();
    for (const seg of segments) {
      for (const n of seg.detailNodes || []) {
        if (!n?.date) continue;
        const k = `${seg.id}|${n.date}`;
        m.set(k, { ...n, segId: seg.id });
      }
    }
    return m;
  }, [segments]);

  const laneCount = segments.length;
  const gridCols = `${DATE_COL_W}px repeat(${laneCount}, minmax(${LANE_W}px, 1fr))`;
  const projectPeriodLabel =
    pStart && pEnd ? `${format(pStart, 'M/d')} — ${format(pEnd, 'M/d')}` : '';
  const rowH = useWeekRows ? WEEK_ROW_H : DAY_ROW_H;

  useEffect(() => {
    const el = scrollRef.current;
    const row = todayRowRef.current;
    if (!el || !row) return;
    const t = window.setTimeout(() => {
      const top = row.offsetTop - el.clientHeight * 0.35;
      el.scrollTop = Math.max(0, top);
    }, 80);
    return () => window.clearTimeout(t);
  }, [timeRows.length, isLoading]);

  if (isLoading) {
    return (
      <div className="surface rounded-xl p-6 text-center text-sm text-slate-500">
        載入直式時程…
      </div>
    );
  }

  if (!pStart || !pEnd) {
    return (
      <div className="surface rounded-xl p-4 text-sm text-slate-500">
        請先在電腦版設定專案起訖日期。
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div className="surface rounded-xl p-4 text-sm text-slate-500">
        尚無項目。請在「項目」分頁套用公版或新增後再預覽。
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-1' : 'space-y-2'}>
      {!embedded ? (
        <p className="text-xs text-slate-500 leading-relaxed px-0.5">
          直式預覽：時間由上往下
          {useWeekRows ? '（每列一週）' : '（每列一日）'}，點列可標示該日進度。編輯請用電腦版甘特圖。
          {projectPeriodLabel ? (
            <span className="block mt-1 text-slate-600 tabular-nums">
              專案總長 {projectPeriodLabel}
            </span>
          ) : null}
        </p>
      ) : projectPeriodLabel ? (
        <p className="text-[10px] text-slate-500 tabular-nums px-0.5">專案 {projectPeriodLabel}</p>
      ) : null}

      <div
        className={
          embedded
            ? 'rounded-lg overflow-hidden border border-slate-200/70'
            : 'surface rounded-xl overflow-hidden border border-slate-200/80'
        }
      >
        <div
          ref={scrollRef}
          className={`w-full overflow-y-auto overflow-x-hidden overscroll-contain ${
            embedded ? 'max-h-[200px]' : 'max-h-[min(72vh,640px)]'
          }`}
        >
          <div className="w-full">
            <div
              className="sticky top-0 z-20 grid w-full border-b border-slate-200 bg-slate-50"
              style={{ gridTemplateColumns: gridCols, minHeight: rowH }}
            >
              <div className="border-r border-slate-200 text-[10px] font-semibold text-slate-500 flex items-center justify-end pr-1.5">
                日期
              </div>
              {segments.map((seg) => (
                <div
                  key={seg.id}
                  className="flex items-center justify-center min-w-0 bg-slate-50"
                  title={seg.label}
                >
                  <span
                    className={`text-[10px] font-bold leading-none text-center ${
                      seg.completed ? 'text-emerald-700 line-through' : 'text-slate-800'
                    }`}
                  >
                    {shortMilestoneLabel(seg.label)}
                  </span>
                </div>
              ))}
            </div>

            {timeRows.map((row, stripeIdx) => {
              const isDay = row.kind === 'day';
              const day = isDay ? row.start : null;
              const wknd = isDay
                ? isWeekend(day)
                : spanHasWeekend(row.start, row.end);
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

                  {segments.map((seg, si) => {
                    const active = rangesOverlap(row.start, row.end, seg.start, seg.end);
                    const color = MILESTONE_COLORS[si % MILESTONE_COLORS.length];
                    const nodeKey = isDay ? `${seg.id}|${ymd(day)}` : null;
                    const node = nodeKey ? nodesBySegDate.get(nodeKey) : null;
                    const meta = node ? nodeKindMeta(node.kind) : null;

                    return (
                      <span
                        key={seg.id}
                        className="relative flex items-center justify-center"
                        style={{
                          backgroundColor: active
                            ? seg.completed
                              ? 'rgba(16, 185, 129, 0.45)'
                              : color
                            : 'transparent',
                        }}
                        title={
                          node
                            ? `${node.label}（${seg.label}）`
                            : active
                              ? seg.label
                              : undefined
                        }
                      >
                        {node ? (
                          <span
                            className="w-2 h-2 rounded-sm border border-white/80 shadow-sm shrink-0"
                            style={{ backgroundColor: meta.color }}
                          />
                        ) : null}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!embedded ? (
        <>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 px-0.5">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm gantt-weekend border border-slate-200" />
              週末
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm gantt-holiday border border-amber-200/80" />
              國定假日
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm ring-2 ring-indigo-400 bg-indigo-50" />
              今天
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-indigo-100 ring-2 ring-inset ring-indigo-400" />
              點選列
            </span>
          </div>

          <ul className="space-y-1.5">
            {segments.map((seg, i) => (
              <li key={seg.id} className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="w-3 h-3 rounded-sm shrink-0 border border-slate-200"
                  style={{
                    backgroundColor: seg.completed
                      ? '#10b981'
                      : MILESTONE_COLORS[i % MILESTONE_COLORS.length],
                  }}
                />
                <span className={seg.completed ? 'line-through text-emerald-800' : ''}>
                  <span className="font-semibold text-slate-800">{shortMilestoneLabel(seg.label)}</span>
                  <span className="text-slate-400 mx-1">·</span>
                  {seg.label}
                </span>
                <span className="text-slate-400 tabular-nums ml-auto shrink-0">
                  {ymd(seg.start)} — {ymd(seg.end)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
