'use client';

import Link from 'next/link';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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

const DEFAULT_DAY_W = 44;
const MIN_DAY_W = 16;
const MAX_DAY_W = 80;
const ROW_H = 56;
const HEADER_H = 80;
const LABEL_W = 260;

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
export default function StudioProjectsGantt({ projects = [], allocations = [], onUpdate, rangeWeeks = 16, pastWeeks = 4 }) {
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
  useEffect(() => { dayWRef.current = dayW; }, [dayW]);
  const [scrollLeft, setScrollLeft] = useState(0);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!tooltip) return;
    const raf = window.requestAnimationFrame(() => {
      const el = tooltipBoxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTooltipSize({ w: r.width, h: r.height });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [tooltip?.project?.id, tooltip?.span?.start, tooltip?.span?.end]);

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
    [dateToX]
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
        await api.updateProject(drag.origProject.id, buildUpdatePayload(drag.origProject, g.startDate, g.endDate));
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

  useEffect(() => {
    if (containerRef.current) {
      // Initial scroll: place today near the left edge but keep ~80px of past
      // visible so users see continuity without burying today off-screen.
      const todayX = dateToX(format(today, 'yyyy-MM-dd'));
      const initial = Math.max(0, todayX - 80);
      containerRef.current.scrollLeft = initial;
      setScrollLeft(initial);
      if (hScrollRef.current) hScrollRef.current.scrollLeft = initial;
    }
  }, [dateToX, today]);

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
        const next = Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, cur * factor));
        if (Math.abs(next - cur) < 0.5) return;
        const rect = el.getBoundingClientRect();
        const cursorInTimeline = e.clientX - rect.left + el.scrollLeft - LABEL_W;
        const dayUnderCursor = cursorInTimeline / cur;
        setDayW(next);
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const newScrollLeft = dayUnderCursor * next + LABEL_W - (e.clientX - rect.left);
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

  // Alternating-week tint stripes. Only weekdays of "odd" weeks are tinted
  // so weekend cells stay clean (and get only the weekend overlay on top).
  // Color is controlled by --gantt-alt-week-tint in globals.css.
  const altWeekStripes = useMemo(() => {
    const stripes = [];
    let weekIdx = -1;
    let runStart = -1;
    let runSpan = 0;
    days.forEach((d, i) => {
      const isMonday = d.getDay() === 1;
      if (isMonday || i === 0) weekIdx += 1;
      const isAlt = weekIdx % 2 === 1;
      const isWeekday = !isWeekend(d);
      if (isAlt && isWeekday) {
        if (runStart === -1) { runStart = i; runSpan = 1; }
        else runSpan += 1;
      } else if (runStart !== -1) {
        stripes.push({ startIdx: runStart, span: runSpan });
        runStart = -1;
        runSpan = 0;
      }
    });
    if (runStart !== -1) stripes.push({ startIdx: runStart, span: runSpan });
    return stripes;
  }, [days]);

  const scrollToToday = useCallback(() => {
    const todayX = dateToX(format(today, 'yyyy-MM-dd'));
    const target = Math.max(0, todayX - 80);
    syncingRef.current = true;
    if (containerRef.current) containerRef.current.scrollLeft = target;
    if (hScrollRef.current) hScrollRef.current.scrollLeft = target;
    setScrollLeft(target);
    syncingRef.current = false;
  }, [dateToX, today]);

  return (
    <div className="surface overflow-hidden select-none relative" style={{ fontFamily: 'inherit' }}>
      {/* Pinned today indicator (fixed, does not scroll horizontally).
          Placed inside the label column, anchored to its right edge. */}
      <button
        type="button"
        onClick={scrollToToday}
        className="absolute z-40 top-[8px] -translate-x-full text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded-lg shadow"
        style={{ left: LABEL_W - 8 }}
        title="回到今天"
      >
        {format(today, 'MMM d')}
      </button>
      {(() => {
        const todayPx = dateToX(format(today, 'yyyy-MM-dd')) + dayW / 2;
        const screenX = LABEL_W + todayPx - scrollLeft;
        if (screenX < LABEL_W) return null;
        return (
          <div
            className="absolute z-30 bg-indigo-400/60 pointer-events-none"
            style={{ left: screenX, top: HEADER_H, width: 1.5, bottom: 10 }}
          />
        );
      })()}

      <div
        ref={containerRef}
        className="overflow-x-auto overflow-y-auto gantt-scroll gantt-main-scroll"
        style={{ maxHeight: 'calc(100vh - 280px)' }}
        onScroll={() => {
          const sl = containerRef.current?.scrollLeft || 0;
          setScrollLeft(sl);
          if (syncingRef.current) return;
          syncingRef.current = true;
          if (hScrollRef.current) hScrollRef.current.scrollLeft = sl;
          syncingRef.current = false;
        }}
      >
        <div style={{ width: LABEL_W + totalW, minHeight: HEADER_H + Math.max(rows.length, 1) * ROW_H }}>
          <div className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-white/60" style={{ height: HEADER_H }}>
            <div style={{ display: 'flex', height: '100%' }}>
              <div
                style={{ width: LABEL_W, minWidth: LABEL_W }}
                className="flex items-end pb-2 px-4 border-r border-white/60 sticky left-0 z-30 bg-white/70 backdrop-blur"
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">專案</span>
              </div>
              <div style={{ position: 'relative', width: totalW }}>
                <div style={{ display: 'flex', height: 36, alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                  {weekGroups.map((g, i) => (
                    <div
                      key={i}
                      style={{ width: g.days * dayW, minWidth: g.days * dayW }}
                      className="flex items-baseline gap-1.5 text-xs font-semibold text-slate-500 px-2 overflow-hidden whitespace-nowrap border-r border-white/40"
                    >
                      <span>{g.label}</span>
                      <span className="text-[9px] font-medium text-slate-400 tabular-nums">W{g.weekNo}</span>
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
                        <span className="text-[9px] text-slate-400 uppercase">{format(d, 'EEE')[0]}</span>
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
                  <Link href={`/projects/${project.id}`} className="text-xs font-semibold text-slate-800 truncate hover:text-indigo-600">
                    {project.name}
                  </Link>
                  <p className="text-[10px] text-slate-500 truncate">
                    {project.client_name || '無客戶'}
                    {hasBar && span.source === 'allocations' && (
                      <span className="text-slate-400"> · 依分配推算</span>
                    )}
                  </p>
                  {!hasBar && (
                    <p className="text-[10px] text-amber-600/90 mt-0.5">未設定時程（請編輯專案日期或新增分配）</p>
                  )}
                </div>

                <div style={{ position: 'relative', width: totalW, height: ROW_H }}>
                  {/* Alternating-week tint (drawn first, behind weekend stripes). */}
                  {altWeekStripes.map((s, i) => (
                    <div
                      key={`altw-${i}`}
                      style={{ position: 'absolute', left: s.startIdx * dayW, top: 0, width: s.span * dayW, height: '100%' }}
                      className="gantt-alt-week"
                    />
                  ))}
                  {days.map((d, i) =>
                    isWeekend(d) ? (
                      <div
                        key={i}
                        style={{ position: 'absolute', left: i * dayW, top: 0, width: dayW, height: '100%' }}
                        className="gantt-weekend"
                      />
                    ) : null
                  )}

                  {(() => {
                    // today marker is pinned outside the scroll area
                    return null;
                  })()}

                  {hasBar && w > 0 && (
                    <div style={{ position: 'absolute', left: x + 2, top: 14, width: w - 4, height: 28, zIndex: isDragging ? 20 : 5 }}>
                      <div
                        style={{
                          ...barBg,
                          borderRadius: 6,
                          height: '100%',
                          width: '100%',
                          opacity: isDragging ? 0.4 : 1,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                        onMouseDown={(e) => handleBarMouseDown(e, rowIdx, { project, span }, 'move')}
                        onMouseEnter={(e) => setTooltip({ project, span, x: e.clientX, y: e.clientY })}
                        onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <div
                          style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', cursor: 'ew-resize', zIndex: 2 }}
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
                          style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'ew-resize', zIndex: 2 }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleBarMouseDown(e, rowIdx, { project, span }, 'resize-right');
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {ghost && dragging?.projectId === project.id && ghost.rowIdx === rowIdx && (() => {
                    const gx = dateToX(format(ghost.startDate, 'yyyy-MM-dd'));
                    const gxEnd = dateToX(format(ghost.endDate, 'yyyy-MM-dd')) + dayW;
                    const gw = gxEnd - gx;
                    if (gw <= 0) return null;
                    return (
                      <div style={{ position: 'absolute', left: gx + 2, top: 14, width: gw - 4, height: 28, zIndex: 30, pointerEvents: 'none' }}>
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
                          <span style={{ color: 'white', fontSize: 11, fontWeight: 600, paddingLeft: 8, whiteSpace: 'nowrap' }}>
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

      {/* Bottom horizontal scrollbar aligned to timeline start (after label column) */}
      <div
        ref={hScrollRef}
        className="overflow-x-auto gantt-scroll"
        style={{ marginLeft: LABEL_W }}
        onScroll={() => {
          const sl = hScrollRef.current?.scrollLeft || 0;
          setScrollLeft(sl);
          if (syncingRef.current) return;
          syncingRef.current = true;
          if (containerRef.current) containerRef.current.scrollLeft = sl;
          syncingRef.current = false;
        }}
      >
        <div style={{ width: totalW, height: 10 }} />
      </div>

      {tooltip && !dragging && (() => {
        const OFFSET = 12;
        const PAD = 8;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
        let left = tooltip.x + OFFSET;
        let top = tooltip.y + OFFSET;
        if (vw && vh && tooltipSize.w && tooltipSize.h) {
          left = Math.min(left, vw - tooltipSize.w - PAD);
          top = Math.min(top, vh - tooltipSize.h - PAD);
          left = Math.max(PAD, left);
          top = Math.max(PAD, top);
        }
        return (
          <div style={{ position: 'fixed', left, top, zIndex: 100, pointerEvents: 'none' }}>
            <div ref={tooltipBoxRef} className="bg-gray-900/90 text-white rounded-lg px-3 py-2 text-xs shadow-xl backdrop-blur max-w-xs">
            <p className="font-semibold">{tooltip.project.name}</p>
            <p className="text-gray-300">{tooltip.project.client_name || '無客戶'}</p>
            {tooltip.span.start && tooltip.span.end && (
              <p className="text-gray-400 mt-0.5">
                {tooltip.span.start} → {tooltip.span.end}
                {tooltip.span.source === 'allocations' ? '（依分配推算）' : ''}
              </p>
            )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
