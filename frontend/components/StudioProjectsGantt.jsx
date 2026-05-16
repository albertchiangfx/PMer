'use client';

import Link from 'next/link';
import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  format,
  parseISO,
  differenceInDays,
  startOfWeek,
  eachDayOfInterval,
  isToday,
  isWeekend,
} from 'date-fns';
import { api } from '../lib/api';
import { parseTimelineDetailNodes } from '../lib/timeline-detail-nodes';
import {
  GANTT_OFFSCREEN_DOT,
  GANTT_OFFSCREEN_DOT_STORAGE_KEY,
  barTouchesTimelineViewportLeft,
} from './ganttOffscreenDots';

const DEFAULT_DAY_W = 18; // start zoomed-out so users see many days; ctrl+wheel zooms in
const MIN_DAY_W = 12;
const ABS_MIN_DAY_W = 3;
const MAX_DAY_W = 80;
const ROW_H = 56;
const HEADER_H_FULL = 80;
const HEADER_H_COMPACT = 40;
const LABEL_W = 260;
const INDICATOR_GUTTER_W = 14;
const PINNED_LEFT_W = LABEL_W + INDICATOR_GUTTER_W;

/** Prefer project.start/end; otherwise min–max hull of allocations for that project. */
function getProjectTimelineSpan(project, projectAllocations) {
  const hasOfficial = project.start_date && project.end_date;
  if (hasOfficial) {
    return {
      start: project.start_date,
      end: project.end_date,
      source: 'project',
    };
  }
  const valid = (projectAllocations || []).filter((a) => a.start_date && a.end_date);
  if (!valid.length) return { start: null, end: null, source: 'none' };
  let minS = valid[0].start_date;
  let maxE = valid[0].end_date;
  for (const a of valid) {
    if (a.start_date < minS) minS = a.start_date;
    if (a.end_date > maxE) maxE = a.end_date;
  }
  return { start: minS, end: maxE, source: 'allocations' };
}

/** 專案底下所有里程碑的時程細節節點（扁平、依日期排序） */
function flattenMilestoneKeypoints(milestones) {
  const list = [];
  for (const m of milestones || []) {
    const ml = String(m?.label || '').trim() || '里程碑';
    for (const n of parseTimelineDetailNodes(m?.timeline_detail_nodes)) {
      list.push({
        id: n.id,
        date: n.date,
        label: n.label,
        milestoneLabel: ml,
      });
    }
  }
  list.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  return list;
}

function buildUpdatePayload(project, startDate, endDate) {
  return {
    name: project.name,
    client_id: project.client_id ?? null,
    description: project.description ?? '',
    budget: project.budget ?? null,
    status: project.status ?? 'planning',
    start_date: format(startDate, 'yyyy-MM-dd'),
    end_date: format(endDate, 'yyyy-MM-dd'),
    color: project.color || '#6366f1',
  };
}

/**
 * Studio-wide Gantt: one row per project, bar = project dates or inferred from allocations.
 * Drag bar to update project start/end (writes official project dates).
 */
export default function StudioProjectsGantt({
  projects = [],
  allocations = [],
  onUpdate,
  rangeWeeks = 16,
  pastWeeks = 4,
  timelineMode: timelineModeProp,
  onTimelineModeChange,
  offscreenDotColor,
  /** Dashboard：專案 id → 里程碑列（含 timeline_detail_nodes） */
  milestonesByProjectId = {},
  /** Dashboard 等情境可設為 false，暫停專案條平移／左右縮放 */
  enableProjectBarDrag = true,
}) {
  const containerRef = useRef(null);
  const hScrollRef = useRef(null);
  const syncingRef = useRef(false);
  const ghostRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const tooltipBoxRef = useRef(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 0, h: 0 });
  const [dayW, setDayW] = useState(DEFAULT_DAY_W);
  const dayWRef = useRef(dayW);
  useEffect(() => {
    dayWRef.current = dayW;
  }, [dayW]);
  const timelineControlled = typeof onTimelineModeChange === 'function';
  const [fallbackTimelineMode, setFallbackTimelineMode] = useState('auto');
  const timelineMode = timelineControlled ? (timelineModeProp ?? 'auto') : fallbackTimelineMode;
  const timelineModeRef = useRef(timelineMode);
  useEffect(() => {
    timelineModeRef.current = timelineMode;
  }, [timelineMode]);

  useEffect(() => {
    if (timelineMode === 'dayWeek') {
      setDayW((d) => Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, d)));
    } else if (timelineMode === 'monthOnly') {
      setDayW((d) => Math.min(MIN_DAY_W - 0.01, Math.max(ABS_MIN_DAY_W, Math.min(d, 10))));
    }
  }, [timelineMode]);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [timelineViewportW, setTimelineViewportW] = useState(0);
  const [storedOffscreenDotHex, setStoredOffscreenDotHex] = useState(null);
  const today = useMemo(() => new Date(), []);
  const tooltipHideTimerRef = useRef(null);
  const clearTooltipHideTimer = useCallback(() => {
    if (tooltipHideTimerRef.current != null) {
      clearTimeout(tooltipHideTimerRef.current);
      tooltipHideTimerRef.current = null;
    }
  }, []);
  const scheduleTooltipHide = useCallback(() => {
    clearTooltipHideTimer();
    tooltipHideTimerRef.current = window.setTimeout(() => {
      tooltipHideTimerRef.current = null;
      setTooltip(null);
    }, 220);
  }, [clearTooltipHideTimer]);

  useEffect(
    () => () => {
      if (tooltipHideTimerRef.current != null) clearTimeout(tooltipHideTimerRef.current);
    },
    []
  );

  useEffect(() => {
    try {
      const v = localStorage.getItem(GANTT_OFFSCREEN_DOT_STORAGE_KEY);
      if (v) setStoredOffscreenDotHex(v);
    } catch (_) {
      /* ignore */
    }
  }, []);

  const offscreenDotStyle = useMemo(
    () => ({
      ...GANTT_OFFSCREEN_DOT,
      backgroundColor:
        offscreenDotColor || storedOffscreenDotHex || GANTT_OFFSCREEN_DOT.backgroundColor,
    }),
    [offscreenDotColor, storedOffscreenDotHex]
  );

  const showMonthOnlyHeader =
    timelineMode === 'monthOnly' || (timelineMode === 'auto' && dayW < MIN_DAY_W);
  const headerH = showMonthOnlyHeader ? HEADER_H_COMPACT : HEADER_H_FULL;

  useLayoutEffect(() => {
    if (!tooltip) {
      setTooltipSize({ w: 0, h: 0 });
      return;
    }
    const el = tooltipBoxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTooltipSize({ w: r.width, h: r.height });
  }, [tooltip?.project?.id, tooltip?.span?.start, tooltip?.span?.end, tooltip?.kp?.total]);

  const allocsByProject = useMemo(() => {
    const m = {};
    for (const a of allocations) {
      const pid = a.project_id;
      if (!pid) continue;
      if (!m[pid]) m[pid] = [];
      m[pid].push(a);
    }
    return m;
  }, [allocations]);

  const rows = useMemo(() => {
    const list = (projects || []).map((project) => {
      const pas = allocsByProject[project.id] || [];
      const span = getProjectTimelineSpan(project, pas);
      return { project, span, pas };
    });
    // Sort by start date: near → far (desc). Fallback to project.start_date, then allocations hull, then push to bottom.
    list.sort((a, b) => {
      const as = a.span?.start || a.project?.start_date || null;
      const bs = b.span?.start || b.project?.start_date || null;
      if (as && bs) return String(bs).localeCompare(String(as));
      if (as) return -1;
      if (bs) return 1;
      return a.project.name.localeCompare(b.project.name, 'zh-Hant');
    });
    return list;
  }, [projects, allocsByProject]);

  const keypointStatsByProjectId = useMemo(() => {
    const ymd = format(today, 'yyyy-MM-dd');
    const weekEndYmd = format(addDays(today, 7), 'yyyy-MM-dd');
    const map = {};
    for (const { project } of rows) {
      const pid = project.id;
      const ms =
        milestonesByProjectId[pid] ?? milestonesByProjectId[String(pid)] ?? [];
      const nodes = flattenMilestoneKeypoints(ms);
      const upcoming = nodes.filter((n) => n.date >= ymd);
      const inWeek = nodes.filter((n) => n.date >= ymd && n.date <= weekEndYmd);
      map[pid] = {
        total: nodes.length,
        upcomingCount: upcoming.length,
        in7: inWeek,
        next: upcoming[0] ?? null,
      };
    }
    return map;
  }, [rows, milestonesByProjectId, today]);

  useEffect(() => {
    ghostRef.current = ghost;
  }, [ghost]);

  // Timeline starts `pastWeeks` weeks before today (snapped to Monday) so
  // recent history is visible. Total visible span = pastWeeks + rangeWeeks.
  const rangeStart = useMemo(() => {
    return startOfWeek(addDays(today, -pastWeeks * 7), { weekStartsOn: 1 });
  }, [today, pastWeeks]);
  const totalDays = (pastWeeks + rangeWeeks) * 7 - 1;
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, totalDays) }),
    [rangeStart, totalDays]
  );
  const totalW = days.length * dayW;

  const dateToX = useCallback(
    (dateStr) => {
      if (!dateStr) return 0;
      const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
      return differenceInDays(d, rangeStart) * dayW;
    },
    [rangeStart, dayW]
  );

  const xToDate = useCallback(
    (x) => {
      const dayIdx = Math.round(x / dayW);
      return addDays(rangeStart, Math.max(0, Math.min(dayIdx, days.length - 1)));
    },
    [rangeStart, days.length, dayW]
  );

  const handleBarMouseDown = useCallback(
    (e, rowIdx, row, type) => {
      clearTooltipHideTimer();
      setTooltip(null);
      if (!enableProjectBarDrag) return;
      const { span } = row;
      if (!span.start || !span.end) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging({
        projectId: row.project.id,
        type,
        origClientX: e.clientX,
        origClientY: e.clientY,
        origProject: row.project,
        origSpan: span,
        startX: dateToX(span.start),
        endX: dateToX(span.end) + dayW,
        rowIdx,
      });
      setGhost(null);
    },
    [dateToX, enableProjectBarDrag, clearTooltipHideTimer]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const dx = e.clientX - dragging.origClientX;
      const { type, origSpan, startX, endX, rowIdx } = dragging;
      const origStart = parseISO(origSpan.start);
      const origEnd = parseISO(origSpan.end);

      let newStart;
      let newEnd;

      if (type === 'move') {
        const snappedDx = Math.round(dx / dayW) * dayW;
        const newStartX = startX + snappedDx;
        const newEndX = endX + snappedDx;
        newStart = xToDate(newStartX);
        newEnd = xToDate(newEndX - dayW);
      } else if (type === 'resize-right') {
        newStart = origStart;
        const snappedDx = Math.round(dx / dayW) * dayW;
        newEnd = xToDate(Math.max(endX + snappedDx - dayW, startX + dayW - 1));
      } else {
        newEnd = origEnd;
        const snappedDx = Math.round(dx / dayW) * dayW;
        newStart = xToDate(Math.min(startX + snappedDx, endX - dayW));
      }

      setGhost({
        rowIdx,
        startDate: newStart,
        endDate: newEnd,
        title: dragging.origProject.name,
        color: dragging.origProject.color || 'var(--apple-blue)',
      });
    };

    const onUp = async () => {
      const g = ghostRef.current;
      const drag = dragging;
      setDragging(null);
      setGhost(null);
      if (!g || !drag?.origProject) return;
      try {
        await api.updateProject(
          drag.origProject.id,
          buildUpdatePayload(drag.origProject, g.startDate, g.endDate)
        );
        onUpdate?.();
      } catch (err) {
        alert(err.message || '更新專案日期失敗');
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, xToDate, onUpdate]);

  // Initial scroll runs ONCE on mount only. We intentionally do NOT depend on
  // dateToX/today, otherwise zoom/range-changes would force the view back to
  // today and undo the user's manual scroll/zoom interactions.
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (initialScrolledRef.current) return;
    if (!containerRef.current) return;
    const todayX = dateToX(format(today, 'yyyy-MM-dd'));
    const initial = Math.max(0, todayX);
    containerRef.current.scrollLeft = initial;
    setScrollLeft(initial);
    if (hScrollRef.current) hScrollRef.current.scrollLeft = initial;
    initialScrolledRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel: vertical wheel -> horizontal scroll; Ctrl+wheel -> zoom timeline density.
  // React's onWheel is passive in modern react-dom, so we attach a native non-passive
  // listener via useEffect to be able to call preventDefault().
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const cur = dayWRef.current;
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        const mode = timelineModeRef.current;
        let lo = ABS_MIN_DAY_W;
        let hi = MAX_DAY_W;
        if (mode === 'dayWeek') {
          lo = MIN_DAY_W;
        } else if (mode === 'monthOnly') {
          hi = MIN_DAY_W - 0.01;
        }
        const next = Math.max(lo, Math.min(hi, cur * factor));
        if (Math.abs(next - cur) < 0.5) return;
        const rect = el.getBoundingClientRect();
        const cursorInTimeline = e.clientX - rect.left + el.scrollLeft - PINNED_LEFT_W;
        const dayUnderCursor = cursorInTimeline / cur;
        setDayW(next);
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const newScrollLeft = dayUnderCursor * next + PINNED_LEFT_W - (e.clientX - rect.left);
          containerRef.current.scrollLeft = Math.max(0, newScrollLeft);
          if (hScrollRef.current) hScrollRef.current.scrollLeft = containerRef.current.scrollLeft;
        });
        return;
      }
      if (e.shiftKey) return;
      const dy = e.deltaY;
      if (dy === 0) return;
      e.preventDefault();
      el.scrollLeft += dy;
      if (hScrollRef.current) hScrollRef.current.scrollLeft = el.scrollLeft;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [timelineMode]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
    });
    ro.observe(el);
    setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
    return () => ro.disconnect();
  }, []);

  const weekGroups = useMemo(() => {
    const groups = [];
    let cur = null;
    let lastMonth = null;
    let weekNoInMonth = 0;
    for (const d of days) {
      const isStartOfWeek = d.getDay() === 1;
      if (isStartOfWeek || !cur) {
        const month = d.getMonth();
        if (month !== lastMonth) {
          weekNoInMonth = 1;
          lastMonth = month;
        } else {
          weekNoInMonth += 1;
        }
        const label = isStartOfWeek ? format(d, 'MMM') : '';
        cur = { label, days: 1, weekNo: weekNoInMonth };
        groups.push(cur);
      } else {
        cur.days++;
      }
    }
    return groups;
  }, [days]);

  const monthGroups = useMemo(() => {
    const groups = [];
    let cur = null;
    for (const d of days) {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!cur || cur.key !== key) {
        cur = { key, days: 1, label: format(d, 'yyyy年M月') };
        groups.push(cur);
      } else {
        cur.days += 1;
      }
    }
    return groups;
  }, [days]);

  const scrollToToday = useCallback(() => {
    const todayX = dateToX(format(today, 'yyyy-MM-dd'));
    const target = Math.max(0, todayX);
    syncingRef.current = true;
    if (containerRef.current) containerRef.current.scrollLeft = target;
    if (hScrollRef.current) hScrollRef.current.scrollLeft = target;
    setScrollLeft(target);
    syncingRef.current = false;
  }, [dateToX, today]);

  const handleTimelineModeChange = useCallback(
    (e) => {
      const next = e.target.value;
      if (timelineControlled) onTimelineModeChange(next);
      else setFallbackTimelineMode(next);
    },
    [timelineControlled, onTimelineModeChange]
  );

  const tw = timelineViewportW;
  const visT1 = Math.min(totalW, scrollLeft + Math.max(0, tw));

  return (
    <div className="surface overflow-hidden select-none relative" style={{ fontFamily: 'inherit' }}>
      {!timelineControlled && (
        <label className="absolute z-40 top-2 right-3 flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="sr-only">時間列顯示</span>
          <select
            value={timelineMode}
            onChange={handleTimelineModeChange}
            className="rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            title="時間列顯示方式（Ctrl+滾輪仍可依模式縮放）"
          >
            <option value="auto">自動（縮小後僅月份）</option>
            <option value="dayWeek">日與週</option>
            <option value="monthOnly">僅月份</option>
          </select>
        </label>
      )}
      {/* Pinned today pill at timeline gutter edge (aligned with vertical divider). */}
      <button
        type="button"
        onClick={scrollToToday}
        className="absolute z-40 top-[8px] -translate-x-full text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded-lg shadow"
        style={{ left: PINNED_LEFT_W - 8 }}
        title="回到今天"
      >
        {format(today, 'MMM d')}
      </button>
      {(() => {
        const todayPx = dateToX(format(today, 'yyyy-MM-dd')) + dayW / 2;
        const screenX = PINNED_LEFT_W + todayPx - scrollLeft;
        if (screenX < PINNED_LEFT_W) return null;
        return (
          <div
            className="absolute z-30 bg-indigo-400/60 pointer-events-none"
            style={{ left: screenX, top: headerH, width: 1.5, bottom: 10 }}
          />
        );
      })()}

      <div
        className="relative flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 280px)' }}
      >
        <div
          ref={containerRef}
          className="gantt-scroll gantt-main-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto"
          onScroll={() => {
            const el = containerRef.current;
            const sl = el?.scrollLeft || 0;
            setScrollLeft(sl);
            if (el) setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
            if (syncingRef.current) return;
            syncingRef.current = true;
            if (hScrollRef.current) hScrollRef.current.scrollLeft = sl;
            syncingRef.current = false;
          }}
        >
          <div
            style={{
              width: PINNED_LEFT_W + totalW,
              minHeight: headerH + Math.max(rows.length, 1) * ROW_H,
            }}
          >
            <div
              className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-white/60"
              style={{ height: headerH }}
            >
              <div style={{ display: 'flex', height: '100%' }}>
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className={`flex px-4 border-r border-white/60 sticky left-0 z-30 bg-white/70 backdrop-blur ${showMonthOnlyHeader ? 'items-center' : 'items-end pb-2'}`}
                >
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    專案
                  </span>
                </div>
                <div
                  style={{ width: INDICATOR_GUTTER_W, minWidth: INDICATOR_GUTTER_W, left: LABEL_W }}
                  className="sticky shrink-0 border-r border-slate-200/80 bg-slate-50/90 z-[29]"
                />
                <div style={{ position: 'relative', width: totalW }}>
                  {showMonthOnlyHeader ? (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                      {monthGroups.map((g, i) => (
                        <div
                          key={g.key + i}
                          style={{ width: g.days * dayW, minWidth: g.days * dayW }}
                          className="flex h-full items-center border-r border-white/40 px-2 text-xs font-semibold text-slate-600"
                        >
                          <span className="truncate">{g.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          height: 36,
                          alignItems: 'center',
                          borderBottom: '1px solid rgba(0,0,0,.06)',
                        }}
                      >
                        {weekGroups.map((g, i) => (
                          <div
                            key={i}
                            style={{ width: g.days * dayW, minWidth: g.days * dayW }}
                            className="flex items-baseline gap-1.5 text-xs font-semibold text-slate-500 px-2 overflow-hidden whitespace-nowrap border-r border-white/40"
                          >
                            <span>{g.label}</span>
                            <span className="text-[9px] font-medium text-slate-400 tabular-nums">
                              W{g.weekNo}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', height: 44, alignItems: 'center' }}>
                        {days.map((d, i) => {
                          const isToday_ = isToday(d);
                          const isWknd = isWeekend(d);
                          return (
                            <div
                              key={i}
                              style={{ width: dayW, minWidth: dayW }}
                              className={`flex flex-col items-center justify-center h-full border-r border-white/30 ${isWknd ? 'opacity-40' : ''}`}
                            >
                              <span className="text-[9px] text-slate-400 uppercase">
                                {format(d, 'EEE')[0]}
                              </span>
                              <span
                                className={`text-xs font-medium mt-0.5 w-5 h-5 flex items-center justify-center rounded-full
                          ${isToday_ ? 'bg-indigo-500 text-white' : 'text-slate-500'}`}
                              >
                                {format(d, 'd')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {rows.map(({ project, span }, rowIdx) => {
              const color = project.color || 'var(--apple-blue)';
              const hasBar = span.start && span.end;
              const rawX = hasBar ? dateToX(span.start) : 0;
              const rawXEnd = hasBar ? dateToX(span.end) + dayW : 0;
              const x = Math.max(0, rawX);
              const xEnd = Math.max(x, rawXEnd);
              const w = hasBar ? xEnd - x : 0;
              const isDragging = dragging?.projectId === project.id;
              const muted = project.status === 'cancelled';

              // Solid (opaque) gradient so bars sit on top of the row's
              // alt-week / weekend tints without being color-shifted by them.
              const barBg = {
                backgroundImage: 'linear-gradient(90deg, #1f2937, #374151)',
              };

              const rowMinX = hasBar ? dateToX(span.start) : null;
              const showRowDotLeft =
                hasBar && barTouchesTimelineViewportLeft(rowMinX, scrollLeft, PINNED_LEFT_W);
              const showRowDotRight = hasBar && tw > 0 && rowMinX >= visT1;

              return (
                <div
                  key={project.id}
                  style={{ display: 'flex', height: ROW_H }}
                  className={`border-b border-slate-200/60 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${muted ? 'opacity-55' : ''}`}
                >
                  <div
                    style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="flex flex-col justify-center px-4 border-r border-white/60 shrink-0 sticky left-0 z-10 bg-inherit min-w-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-xs font-semibold text-slate-800 truncate hover:text-indigo-600 block"
                      >
                        {project.name}
                      </Link>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">
                      {project.client_name || '無客戶'}
                      {hasBar && span.source === 'allocations' && (
                        <span className="text-slate-400"> · 依分配推算</span>
                      )}
                    </p>
                    {!hasBar && (
                      <p className="text-[10px] text-amber-600/90 mt-0.5">
                        未設定時程（請編輯專案日期或新增分配）
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      width: INDICATOR_GUTTER_W,
                      minWidth: INDICATOR_GUTTER_W,
                      left: LABEL_W,
                    }}
                    className={`sticky shrink-0 z-[15] flex items-center justify-center border-r border-slate-200/80 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    {showRowDotLeft && (
                      <span
                        aria-hidden
                        className="pointer-events-none block"
                        style={offscreenDotStyle}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      position: 'relative',
                      width: totalW,
                      height: ROW_H,
                      isolation: 'isolate',
                    }}
                  >
                    {days.map((d, i) =>
                      isWeekend(d) ? (
                        <div
                          key={i}
                          style={{
                            position: 'absolute',
                            left: i * dayW,
                            top: 0,
                            width: dayW,
                            height: '100%',
                          }}
                          className="gantt-weekend"
                        />
                      ) : null
                    )}

                    {showRowDotRight && (
                      <span
                        aria-hidden
                        className="pointer-events-none"
                        style={{
                          ...offscreenDotStyle,
                          position: 'absolute',
                          left: visT1 - 6,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          zIndex: 25,
                        }}
                      />
                    )}

                    {hasBar && w > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: x + 2,
                          top: 14,
                          width: w - 4,
                          height: 28,
                          zIndex: isDragging ? 20 : 5,
                        }}
                        title={
                          enableProjectBarDrag
                            ? undefined
                            : '此檢視暫停拖曳調整專案日期（僅供檢視）'
                        }
                      >
                        <div
                          style={{
                            ...barBg,
                            borderRadius: 6,
                            height: '100%',
                            width: '100%',
                            opacity: isDragging ? 0.4 : 1,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            cursor: enableProjectBarDrag ? 'grab' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                          onMouseDown={(e) =>
                            handleBarMouseDown(e, rowIdx, { project, span }, 'move')
                          }
                          onMouseEnter={(e) => {
                            clearTooltipHideTimer();
                            setTooltipSize({ w: 0, h: 0 });
                            setTooltip({
                              project,
                              span,
                              kp: keypointStatsByProjectId[project.id],
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onMouseMove={(e) =>
                            setTooltip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : t
                            )
                          }
                          onMouseLeave={scheduleTooltipHide}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: 6,
                              height: '100%',
                              cursor: enableProjectBarDrag ? 'ew-resize' : 'default',
                              zIndex: 2,
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, rowIdx, { project, span }, 'resize-left');
                            }}
                          />
                          <span
                            style={{
                              color: 'white',
                              fontSize: 11,
                              fontWeight: 600,
                              paddingLeft: 8,
                              paddingRight: 8,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              pointerEvents: 'none',
                            }}
                          >
                            {project.name}
                          </span>
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              width: 6,
                              height: '100%',
                              cursor: enableProjectBarDrag ? 'ew-resize' : 'default',
                              zIndex: 2,
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, rowIdx, { project, span }, 'resize-right');
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {ghost &&
                      dragging?.projectId === project.id &&
                      ghost.rowIdx === rowIdx &&
                      (() => {
                        const gx = dateToX(format(ghost.startDate, 'yyyy-MM-dd'));
                        const gxEnd = dateToX(format(ghost.endDate, 'yyyy-MM-dd')) + dayW;
                        const gw = gxEnd - gx;
                        if (gw <= 0) return null;
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left: gx + 2,
                              top: 14,
                              width: gw - 4,
                              height: 28,
                              zIndex: 30,
                              pointerEvents: 'none',
                            }}
                          >
                            <div
                              style={{
                                ...barBg,
                                borderRadius: 6,
                                height: '100%',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                opacity: 0.85,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <span
                                style={{
                                  color: 'white',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  paddingLeft: 8,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {ghost.title}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm px-4 text-center">
                尚無專案，請先到「專案」建立。
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={hScrollRef}
        className="overflow-x-auto gantt-scroll"
        style={{ marginLeft: LABEL_W }}
        onScroll={() => {
          const el = containerRef.current;
          const sl = hScrollRef.current?.scrollLeft || 0;
          setScrollLeft(sl);
          if (el) setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
          if (syncingRef.current) return;
          syncingRef.current = true;
          if (el) el.scrollLeft = sl;
          syncingRef.current = false;
        }}
      >
        <div style={{ width: INDICATOR_GUTTER_W + totalW, height: 10 }} />
      </div>

      {tooltip &&
        !dragging &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
          const OFFSET = 12;
          const PAD = 8;
          const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
          const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
          let left = tooltip.x + OFFSET;
          let top = tooltip.y + OFFSET;
          if (vw && vh && tooltipSize.w > 0 && tooltipSize.h > 0) {
            const maxLeft = vw - tooltipSize.w - PAD;
            const maxTop = vh - tooltipSize.h - PAD;
            left = tooltip.x + OFFSET;
            if (left > maxLeft) left = Math.max(PAD, maxLeft);
            if (left < PAD) left = PAD;
            const topAbove = tooltip.y - tooltipSize.h - OFFSET;
            top = topAbove >= PAD ? topAbove : tooltip.y + OFFSET;
            if (top > maxTop) top = Math.max(PAD, maxTop);
            if (top < PAD) top = PAD;
          } else {
            top = tooltip.y - 56;
          }
          return (
            <div style={{ position: 'fixed', left, top, zIndex: 10000, pointerEvents: 'none' }}>
              <div
                ref={tooltipBoxRef}
                className="bg-gray-900/90 text-white rounded-lg px-3 py-2 text-xs shadow-xl backdrop-blur max-w-xs"
              >
                <p className="font-semibold">{tooltip.project.name}</p>
                <p className="text-gray-300">{tooltip.project.client_name || '無客戶'}</p>
                {tooltip.span.start && tooltip.span.end && (
                  <p className="text-gray-400 mt-0.5">
                    {tooltip.span.start} → {tooltip.span.end}
                    {tooltip.span.source === 'allocations' ? '（依分配推算）' : ''}
                  </p>
                )}
                {tooltip.kp && tooltip.kp.total > 0 ? (
                  <div className="mt-2 pt-2 border-t border-white/15 space-y-1">
                    <p className="text-gray-200 font-medium">
                      時程節點 · 共 {tooltip.kp.total} 個
                      {tooltip.kp.upcomingCount > 0
                        ? `（未來 ${tooltip.kp.upcomingCount}）`
                        : '（皆為過去）'}
                    </p>
                    {tooltip.kp.next ? (
                      <p className="text-gray-300 leading-snug">
                        下一個：{tooltip.kp.next.date} · {tooltip.kp.next.label}
                        <span className="text-gray-500">（{tooltip.kp.next.milestoneLabel}）</span>
                      </p>
                    ) : (
                      <p className="text-gray-500 text-[11px]">目前無未來日期的節點</p>
                    )}
                    {(() => {
                      const in7List = Array.isArray(tooltip.kp.in7) ? tooltip.kp.in7 : [];
                      if (in7List.length === 0) return null;
                      return (
                      <div>
                        <p className="text-gray-400 text-[11px] mb-0.5">7 日內：</p>
                        <ul className="text-gray-400 text-[11px] space-y-0.5 list-disc pl-4">
                          {in7List.slice(0, 4).map((n) => (
                            <li key={`${n.id}-${n.date}`}>
                              {n.date} · {n.label}
                            </li>
                          ))}
                        </ul>
                        {in7List.length > 4 && (
                          <p className="text-gray-500 text-[10px] mt-0.5">
                            …還有 {in7List.length - 4} 個
                          </p>
                        )}
                      </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-gray-500 mt-2 text-[11px] leading-snug">
                    尚無里程碑時程節點。至專案頁「里程碑時程」建立 keypoint。
                  </p>
                )}
              </div>
            </div>
          );
        })(),
          document.body
        )}
    </div>
  );
}
