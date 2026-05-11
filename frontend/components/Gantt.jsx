'use client';
import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { addDays, format, parseISO, differenceInDays, startOfWeek, eachDayOfInterval, isToday, isWeekend } from 'date-fns';
import { api } from '../lib/api';
import { initials } from '../lib/utils';
import { GANTT_OFFSCREEN_DOT, GANTT_OFFSCREEN_DOT_STORAGE_KEY, barTouchesTimelineViewportLeft } from './ganttOffscreenDots';

const DEFAULT_DAY_W = 18; // start zoomed-out so users see many days; ctrl+wheel zooms in
/** Below this width the header shows months only (when mode is auto). */
const MIN_DAY_W = 12;
const ABS_MIN_DAY_W = 3;
const MAX_DAY_W = 80;
const ROW_H = 56;
const HEADER_H_FULL = 80;
const HEADER_H_COMPACT = 40;
const LABEL_W = 228;
/** 名稱欄與時間軸之間的「標示區」（提示點放這裡，不壓在格線上） */
const INDICATOR_GUTTER_W = 14;
/** 捲動內容裡，時間軸起點前的固定總寬 = 名稱 + 標示區 */
const PINNED_LEFT_W = LABEL_W + INDICATOR_GUTTER_W;

const BAR_H = 14;
const BAR_GAP = 4;
const LANE_PITCH = BAR_H + BAR_GAP; // vertical distance between adjacent lanes

/** Row height grows with lane count so overlapping allocations can stack vertically. */
function rowHeightForLanes(laneCount) {
  return ROW_H + Math.max(0, laneCount - 1) * LANE_PITCH;
}

/** Vertical offset of a given lane inside a row of the given total height. */
function barTopForLane(rowH, laneCount, lane) {
  const barsHeight = laneCount * BAR_H + Math.max(0, laneCount - 1) * BAR_GAP;
  const padTop = Math.round((rowH - barsHeight) / 2);
  return padTop + lane * LANE_PITCH;
}

function memberKey(alloc) {
  return alloc.member_id || alloc.team_member_id;
}

/** One timeline row per member; that member's allocations render as bars on the same row. */
export default function Gantt({
  members = [],
  allocations = [],
  onUpdate,
  rangeWeeks = 10,
  pastWeeks = 4,
  showRowDelete = false,
  labelColumnTitle = '成員',
  emptyHint,
  /** When set with `onTimelineModeChange`, parent controls mode and the built-in dropdown is hidden. */
  timelineMode: timelineModeProp,
  onTimelineModeChange,
  /** 提示點填充色（例如來自 `<input type="color">`）；未傳則讀 localStorage */
  offscreenDotColor,
}) {
  const containerRef = useRef(null);
  const hScrollRef = useRef(null);
  const syncingRef = useRef(false);
  const ghostRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [conflicts, setConflicts] = useState({});
  const [tooltip, setTooltip] = useState(null);
  const tooltipBoxRef = useRef(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 0, h: 0 });
  const [dayW, setDayW] = useState(DEFAULT_DAY_W);
  const dayWRef = useRef(dayW);
  useEffect(() => { dayWRef.current = dayW; }, [dayW]);
  const timelineControlled = typeof onTimelineModeChange === 'function';
  const [fallbackTimelineMode, setFallbackTimelineMode] = useState('auto');
  const timelineMode = timelineControlled ? (timelineModeProp ?? 'auto') : fallbackTimelineMode;
  const timelineModeRef = useRef(timelineMode);
  useEffect(() => { timelineModeRef.current = timelineMode; }, [timelineMode]);

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

  useEffect(() => {
    if (!tooltip) return;
    const raf = window.requestAnimationFrame(() => {
      const el = tooltipBoxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTooltipSize({ w: r.width, h: r.height });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [tooltip?.alloc?.id, tooltip?.alloc?.start_date, tooltip?.alloc?.end_date]);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  /** One row per member; contains every allocation that belongs to that member.
   *  Allocations that overlap in time are placed in different lanes (vertical stacking). */
  const memberRows = useMemo(() => {
    const map = new Map();
    for (const a of allocations) {
      if (!a.start_date || !a.end_date) continue;
      const mid = memberKey(a);
      if (!mid) continue;
      const member = memberById[mid];
      if (!member) continue;
      if (!map.has(mid)) map.set(mid, { member, allocations: [] });
      map.get(mid).allocations.push({ ...a, member_id: mid, team_member_id: mid });
    }
    for (const v of map.values()) {
      // Sort by start_date so the lane-packing algorithm can sweep left-to-right.
      v.allocations.sort((a, b) => {
        const sa = String(a.start_date).localeCompare(String(b.start_date));
        if (sa !== 0) return sa;
        return (a.project_name || '').localeCompare(b.project_name || '');
      });
      // Greedy first-fit lane assignment: reuse the topmost lane whose last bar
      // ends strictly before this allocation starts; otherwise open a new lane.
      const laneEnds = [];
      for (const a of v.allocations) {
        let lane = -1;
        for (let i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] < a.start_date) { lane = i; break; }
        }
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(a.end_date); }
        else { laneEnds[lane] = a.end_date; }
        a._lane = lane;
      }
      v.laneCount = Math.max(1, laneEnds.length);
      v.rowH = rowHeightForLanes(v.laneCount);
    }
    return Array.from(map.values()).sort((A, B) => A.member.name.localeCompare(B.member.name));
  }, [allocations, memberById]);

  const totalRowsHeight = useMemo(
    () => memberRows.reduce((s, r) => s + r.rowH, 0),
    [memberRows]
  );

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

  const allocsByMember = useMemo(() => {
    const map = {};
    for (const a of allocations) {
      const k = memberKey(a);
      if (!k) continue;
      if (!map[k]) map[k] = [];
      map[k].push(a);
    }
    return map;
  }, [allocations]);

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

  const checkGhostConflict = useCallback(
    (memberId, startDate, endDate, excludeId) => {
      const memberAllocs = allocsByMember[memberId] || [];
      return memberAllocs.some((a) => {
        if (a.id === excludeId) return false;
        const aStart = parseISO(a.start_date);
        const aEnd = parseISO(a.end_date);
        return startDate <= aEnd && endDate >= aStart;
      });
    },
    [allocsByMember]
  );

  const handleBarMouseDown = useCallback(
    (e, rowIdx, alloc, type) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging({
        id: alloc.id,
        type,
        origClientX: e.clientX,
        origClientY: e.clientY,
        origAlloc: alloc,
        startX: dateToX(alloc.start_date),
        endX: dateToX(alloc.end_date) + dayW,
        rowIdx,
      });
      setGhost(null);
    },
    [dateToX]
  );

  useEffect(() => {
    if (!dragging) return;

    // Precompute cumulative Y offsets so a vertical drag can correctly hit-test
    // rows even when they have different heights (multi-lane rows are taller).
    const yOffsets = [0];
    for (const r of memberRows) yOffsets.push(yOffsets[yOffsets.length - 1] + r.rowH);
    const srcRow = memberRows[dragging.rowIdx];
    const origRowMidY = srcRow ? yOffsets[dragging.rowIdx] + srcRow.rowH / 2 : 0;

    const onMove = (e) => {
      const dx = e.clientX - dragging.origClientX;
      const dy = e.clientY - dragging.origClientY;
      const { type, origAlloc, startX, endX, rowIdx } = dragging;

      let newStart;
      let newEnd;
      let newMemberId;
      let ghostRowIdx = rowIdx;

      if (type === 'move') {
        const snappedDx = Math.round(dx / dayW) * dayW;
        const newStartX = startX + snappedDx;
        const newEndX = endX + snappedDx;
        newStart = xToDate(newStartX);
        newEnd = xToDate(newEndX - dayW);

        const targetY = origRowMidY + dy;
        let newRowIdx = rowIdx;
        for (let i = 0; i < memberRows.length; i++) {
          if (targetY >= yOffsets[i] && targetY < yOffsets[i + 1]) { newRowIdx = i; break; }
        }
        newRowIdx = Math.max(0, Math.min(newRowIdx, Math.max(memberRows.length - 1, 0)));
        ghostRowIdx = newRowIdx;
        newMemberId = memberRows[newRowIdx]?.member?.id || memberKey(origAlloc);
      } else if (type === 'resize-right') {
        newStart = parseISO(origAlloc.start_date);
        const snappedDx = Math.round(dx / dayW) * dayW;
        newEnd = xToDate(Math.max(endX + snappedDx - dayW, startX + dayW - 1));
        newMemberId = memberKey(origAlloc);
      } else {
        newEnd = parseISO(origAlloc.end_date);
        const snappedDx = Math.round(dx / dayW) * dayW;
        newStart = xToDate(Math.min(startX + snappedDx, endX - dayW));
        newMemberId = memberKey(origAlloc);
      }

      const hasConflict = checkGhostConflict(newMemberId, newStart, newEnd, origAlloc.id);
      const barTitle = origAlloc.task_name || origAlloc.project_name || 'Allocation';
      setGhost({
        rowIdx: ghostRowIdx,
        memberId: newMemberId,
        startDate: newStart,
        endDate: newEnd,
        title: barTitle,
        projectName: origAlloc.project_name,
        color: origAlloc.project_color || 'var(--apple-blue)',
        conflict: hasConflict,
      });
    };

    const onUp = async () => {
      const g = ghostRef.current;
      if (!g) {
        setDragging(null);
        setGhost(null);
        return;
      }
      const { origAlloc } = dragging;
      // Always attempt to save: overlaps are now expected (they stack in lanes).
      try {
        await api.updateAllocation(origAlloc.id, {
          project_id: origAlloc.project_id,
          member_id: g.memberId,
          start_date: format(g.startDate, 'yyyy-MM-dd'),
          end_date: format(g.endDate, 'yyyy-MM-dd'),
          notes: origAlloc.notes ?? null,
        });
        onUpdate?.();
      } catch (err) {
        if (err.status === 409) {
          setConflicts((prev) => ({ ...prev, [origAlloc.id]: true }));
        }
      }
      setDragging(null);
      setGhost(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, xToDate, memberRows, checkGhostConflict, onUpdate]);

  // Initial scroll runs ONCE on mount only. We intentionally do NOT depend on
  // dateToX/today, otherwise zoom/range-changes would force the view back to
  // today and undo the user's manual scroll/zoom interactions.
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (initialScrolledRef.current) return;
    if (!containerRef.current) return;
    const todayX = dateToX(today);
    // scrollLeft is content X at viewport left; timeline cell left is PINNED_LEFT_W + todayX.
    // Align today's column start with the divider: PINNED_LEFT_W + todayX - scrollLeft === PINNED_LEFT_W ⇒ scrollLeft === todayX.
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
        // Re-anchor scroll after React commits the new dayW (totalW changes).
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const newScrollLeft = dayUnderCursor * next + PINNED_LEFT_W - (e.clientX - rect.left);
          containerRef.current.scrollLeft = Math.max(0, newScrollLeft);
          if (hScrollRef.current) hScrollRef.current.scrollLeft = containerRef.current.scrollLeft;
        });
        return;
      }
      // Non-Ctrl: vertical wheel becomes horizontal scroll. Shift+wheel falls
      // through to native (which on most OS gives horizontal anyway).
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

  const handleDeleteRow = useCallback(
    async (e, alloc) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm('刪除此筆時間分配？該列將從甘特圖移除。')) return;
      try {
        await api.deleteAllocation(alloc.id);
        onUpdate?.();
      } catch (err) {
        alert(err.message || '刪除失敗');
      }
    },
    [onUpdate]
  );

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
    const todayX = dateToX(today);
    const target = Math.max(0, todayX);
    syncingRef.current = true;
    if (containerRef.current) containerRef.current.scrollLeft = target;
    if (hScrollRef.current) hScrollRef.current.scrollLeft = target;
    setScrollLeft(target);
    syncingRef.current = false;
  }, [dateToX, today]);

  const handleTimelineModeChange = useCallback((e) => {
    const next = e.target.value;
    if (timelineControlled) onTimelineModeChange(next);
    else setFallbackTimelineMode(next);
  }, [timelineControlled, onTimelineModeChange]);

  const tw = timelineViewportW;
  /** 時間軸可視區右緣（時間軸座標） */
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
        const todayPx = dateToX(today) + dayW / 2;
        const screenX = PINNED_LEFT_W + todayPx - scrollLeft;
        if (screenX < PINNED_LEFT_W) return null;
        return (
          <div
            className="absolute z-30 bg-indigo-400/60 pointer-events-none"
            style={{ left: screenX, top: headerH, width: 1.5, bottom: 10 }}
          />
        );
      })()}

      <div className="relative flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 240px)' }}>
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
        <div style={{ width: PINNED_LEFT_W + totalW, minHeight: headerH + Math.max(totalRowsHeight, ROW_H) }}>

          <div className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-white/60" style={{ height: headerH }}>
            <div style={{ display: 'flex', height: '100%' }}>
              <div
                style={{ width: LABEL_W, minWidth: LABEL_W }}
                className={`flex px-4 border-r border-white/60 sticky left-0 z-30 bg-white/70 backdrop-blur ${showMonthOnlyHeader ? 'items-center' : 'items-end pb-2'}`}
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{labelColumnTitle}</span>
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
                  </>
                )}
              </div>
            </div>
          </div>

          {memberRows.map(({ member, allocations: memberAllocs, laneCount, rowH }, rowIdx) => {
            const bg = member.avatar_color || 'var(--apple-blue)';
            const ini = initials(member.name);
            // Solid (opaque) gradient so bars sit on top of the row's
            // alt-week / weekend tints without being color-shifted by them.
            const barBg = {
              backgroundImage: 'linear-gradient(90deg, #1f2937, #374151)',
            };

            // 左：任一條繪製左緣碰上／越过視窗裁切線（與 scrollLeft、長條 +2 inset 對齊）；右：整條在可視右緣外
            let showRowDotLeft = false;
            let showRowDotRight = false;
            for (const a of memberAllocs) {
              if (!a.start_date || !a.end_date) continue;
              const bMin = dateToX(a.start_date);
              if (barTouchesTimelineViewportLeft(bMin, scrollLeft, PINNED_LEFT_W)) showRowDotLeft = true;
              if (tw > 0 && bMin >= visT1) showRowDotRight = true;
            }

            return (
              <div
                key={member.id}
                style={{ display: 'flex', height: rowH }}
                className={`border-b border-slate-200/60 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
              >
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className="flex items-center gap-2 px-3 border-r border-white/60 shrink-0 sticky left-0 z-10 bg-inherit"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                    style={{ backgroundColor: bg }}
                  >
                    {ini}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">{member.name}</p>
                    <p className="text-[10px] text-slate-500 truncate" title={member.role}>
                      {member.role}
                      {memberAllocs.length > 1 ? ` · ${memberAllocs.length} 個專案` : ''}
                    </p>
                  </div>
                </div>

                <div
                  style={{ width: INDICATOR_GUTTER_W, minWidth: INDICATOR_GUTTER_W, left: LABEL_W }}
                  className={`sticky shrink-0 z-[15] flex items-center justify-center border-r border-slate-200/80 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                >
                  {showRowDotLeft && (
                    <span aria-hidden className="pointer-events-none block" style={offscreenDotStyle} />
                  )}
                </div>

                <div style={{ position: 'relative', width: totalW, height: rowH, isolation: 'isolate' }}>
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

                  {memberAllocs.map((alloc) => {
                    const rawX = dateToX(alloc.start_date);
                    const rawXEnd = dateToX(alloc.end_date) + dayW;
                    const x = Math.max(0, rawX);
                    const xEnd = Math.max(x, rawXEnd);
                    const w = xEnd - x;
                    if (w <= 0) return null;
                    const isDragging = dragging?.id === alloc.id;
                    const hasConflict = conflicts[alloc.id];
                    const projColor = alloc.project_color || 'var(--apple-blue)';
                    const barTop = barTopForLane(rowH, laneCount, alloc._lane || 0);

                    return (
                      <div
                        key={alloc.id}
                        className="group"
                        style={{ position: 'absolute', left: x + 2, top: barTop, width: w - 4, height: BAR_H, zIndex: isDragging ? 20 : 5 }}
                      >
                        <div
                          style={{
                            ...barBg,
                            borderRadius: 4,
                            height: '100%',
                            width: '100%',
                            opacity: isDragging ? 0.4 : 1,
                            boxShadow: hasConflict ? '0 0 0 2px #FF3B30' : '0 1px 3px rgba(0,0,0,0.15)',
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, rowIdx, alloc, 'move')}
                          onMouseEnter={(e) => setTooltip({ alloc, member, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {/* Project color stripe so different projects in the same row are distinguishable. */}
                          <div
                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: projColor, pointerEvents: 'none' }}
                          />
                          <div
                            style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', cursor: 'ew-resize', zIndex: 2 }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, rowIdx, alloc, 'resize-left');
                            }}
                          />
                          <span
                            style={{
                              color: 'white',
                              fontSize: 10,
                              fontWeight: 600,
                              lineHeight: 1,
                              paddingLeft: 9,
                              paddingRight: 8,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              pointerEvents: 'none',
                            }}
                          >
                            {alloc.task_name || alloc.project_name || '—'}
                          </span>
                          <div
                            style={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'ew-resize', zIndex: 2 }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, rowIdx, alloc, 'resize-right');
                            }}
                          />
                        </div>
                        {showRowDelete && (
                          <button
                            type="button"
                            title="刪除此分配"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => handleDeleteRow(e, alloc)}
                            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] leading-none font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow z-30 flex items-center justify-center"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {ghost && ghost.rowIdx === rowIdx && (() => {
                    const gx = dateToX(ghost.startDate);
                    const gxEnd = dateToX(ghost.endDate) + dayW;
                    const gw = gxEnd - gx;
                    if (gw <= 0) return null;
                    // Keep ghost in the dragged bar's original lane when it stays
                    // on the source row; otherwise sit in the top lane of the target.
                    const onOriginalRow = dragging?.rowIdx === rowIdx;
                    const ghostLane = onOriginalRow ? (dragging?.origAlloc?._lane || 0) : 0;
                    const ghostTop = barTopForLane(rowH, laneCount, ghostLane);
                    return (
                      <div style={{ position: 'absolute', left: gx + 2, top: ghostTop, width: gw - 4, height: BAR_H, zIndex: 30, pointerEvents: 'none' }}>
                        <div
                          style={{
                            ...barBg,
                            borderRadius: 4,
                            height: '100%',
                            boxShadow: ghost.conflict ? '0 0 0 2px #FF3B30, 0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.2)',
                            opacity: 0.85,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'white', fontSize: 10, fontWeight: 600, lineHeight: 1, paddingLeft: 8, whiteSpace: 'nowrap' }}>
                            {ghost.title}
                            {ghost.conflict && <span style={{ marginLeft: 4 }}>⚠</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}

          {memberRows.length === 0 && (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm px-4 text-center">
              {emptyHint ?? '尚無時間分配（請在專案頁或使用「新增分配」建立）'}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Bottom scrollbar：略過名稱欄，寬度 = 標示區 + 時間軸 */}
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
            <div ref={tooltipBoxRef} className="bg-gray-900/90 text-white rounded-lg px-3 py-2 text-xs shadow-xl backdrop-blur">
            <p className="font-semibold">{tooltip.alloc.task_name || tooltip.alloc.project_name}</p>
            <p className="text-gray-300">{tooltip.alloc.project_name}</p>
            <p className="text-gray-400 mt-0.5">{tooltip.alloc.start_date} → {tooltip.alloc.end_date}</p>
            <p className="text-gray-300">{tooltip.member?.name}</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
