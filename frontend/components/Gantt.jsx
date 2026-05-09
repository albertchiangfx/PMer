'use client';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { addDays, format, parseISO, differenceInDays, startOfWeek, eachDayOfInterval, isToday, isWeekend } from 'date-fns';
import { api } from '../lib/api';
import { initials } from '../lib/utils';

const DAY_W = 44;
const ROW_H = 56;
const HEADER_H = 80;
const LABEL_W = 228;

function memberKey(alloc) {
  return alloc.member_id || alloc.team_member_id;
}

/** One timeline row per allocation so the same person can appear on multiple rows (multi-project). */
export default function Gantt({
  members = [],
  allocations = [],
  onUpdate,
  rangeWeeks = 10,
  showRowDelete = false,
  labelColumnTitle = '成員',
  emptyHint,
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
  }, [tooltip?.alloc?.id, tooltip?.alloc?.start_date, tooltip?.alloc?.end_date]);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const rows = useMemo(() => {
    return allocations
      .filter((a) => a.start_date && a.end_date)
      .map((a) => {
        const mid = memberKey(a);
        const member = memberById[mid];
        if (!member) return null;
        const alloc = { ...a, member_id: mid, team_member_id: mid };
        return { allocation: alloc, member };
      })
      .filter(Boolean)
      .sort((A, B) => {
        const na = A.member.name.localeCompare(B.member.name);
        if (na !== 0) return na;
        const pa = (A.allocation.project_name || '').localeCompare(B.allocation.project_name || '');
        if (pa !== 0) return pa;
        return String(A.allocation.start_date).localeCompare(String(B.allocation.start_date));
      });
  }, [allocations, memberById]);

  useEffect(() => {
    ghostRef.current = ghost;
  }, [ghost]);

  // Timeline starts at "today" (not start-of-week)
  const rangeStart = useMemo(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [today]);
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, rangeWeeks * 7 - 1) }),
    [rangeStart, rangeWeeks]
  );
  const totalW = days.length * DAY_W;

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
      return differenceInDays(d, rangeStart) * DAY_W;
    },
    [rangeStart]
  );

  const xToDate = useCallback(
    (x) => {
      const dayIdx = Math.round(x / DAY_W);
      return addDays(rangeStart, Math.max(0, Math.min(dayIdx, days.length - 1)));
    },
    [rangeStart, days.length]
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
        endX: dateToX(alloc.end_date) + DAY_W,
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
      const dy = e.clientY - dragging.origClientY;
      const { type, origAlloc, startX, endX, rowIdx } = dragging;

      let newStart;
      let newEnd;
      let newMemberId;
      let ghostRowIdx = rowIdx;

      if (type === 'move') {
        const snappedDx = Math.round(dx / DAY_W) * DAY_W;
        const newStartX = startX + snappedDx;
        const newEndX = endX + snappedDx;
        newStart = xToDate(newStartX);
        newEnd = xToDate(newEndX - DAY_W);

        const newRowIdx = Math.max(
          0,
          Math.min(rowIdx + Math.round(dy / ROW_H), Math.max(rows.length - 1, 0))
        );
        ghostRowIdx = newRowIdx;
        newMemberId = rows[newRowIdx]?.member?.id || memberKey(origAlloc);
      } else if (type === 'resize-right') {
        newStart = parseISO(origAlloc.start_date);
        const snappedDx = Math.round(dx / DAY_W) * DAY_W;
        newEnd = xToDate(Math.max(endX + snappedDx - DAY_W, startX + DAY_W - 1));
        newMemberId = memberKey(origAlloc);
      } else {
        newEnd = parseISO(origAlloc.end_date);
        const snappedDx = Math.round(dx / DAY_W) * DAY_W;
        newStart = xToDate(Math.min(startX + snappedDx, endX - DAY_W));
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
      if (!g.conflict) {
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
  }, [dragging, xToDate, rows, checkGhostConflict, onUpdate]);

  useEffect(() => {
    if (containerRef.current) {
      const todayX = dateToX(today);
      containerRef.current.scrollLeft = Math.max(0, todayX - 160);
    }
  }, [dateToX, today]);

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
    for (const d of days) {
      const isStartOfWeek = d.getDay() === 1;
      if (isStartOfWeek || !cur) {
        // Show month on every Monday.
        const label = isStartOfWeek ? format(d, 'MMM') : '';
        cur = { label, days: 1 };
        groups.push(cur);
      } else {
        cur.days++;
      }
    }
    return groups;
  }, [days]);

  const scrollToToday = useCallback(() => {
    syncingRef.current = true;
    if (containerRef.current) containerRef.current.scrollLeft = 0;
    if (hScrollRef.current) hScrollRef.current.scrollLeft = 0;
    setScrollLeft(0);
    syncingRef.current = false;
  }, []);

  return (
    <div className="surface rounded-[22px] overflow-hidden select-none relative" style={{ fontFamily: 'inherit' }}>
      {/* Today indicator: tracks today's column with horizontal scroll, and
          hides once today's column would slip behind the label column
          (i.e. "vanishing point" sits at the first calendar column). */}
      {(() => {
        const todayCenterInTimeline = dateToX(today) + DAY_W / 2;
        const todayCenterX = LABEL_W + todayCenterInTimeline - scrollLeft;
        const visible = todayCenterX >= LABEL_W + DAY_W / 2 - 0.5;
        if (!visible) return null;
        return (
          <>
            <button
              type="button"
              onClick={scrollToToday}
              className="absolute z-40 top-[8px] text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded-lg shadow"
              style={{ left: todayCenterX - 18 }}
              title="回到今天"
            >
              {format(today, 'MMM d')}
            </button>
            <div
              className="absolute z-30 bg-indigo-400/60 pointer-events-none"
              style={{ left: todayCenterX, top: HEADER_H, width: 1.5, bottom: 10 }}
            />
          </>
        );
      })()}

      <div
        ref={containerRef}
        className="overflow-x-auto overflow-y-auto gantt-scroll gantt-main-scroll"
        style={{ maxHeight: 'calc(100vh - 240px)' }}
        onScroll={() => {
          if (syncingRef.current) return;
          syncingRef.current = true;
          const sl = containerRef.current?.scrollLeft || 0;
          setScrollLeft(sl);
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
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{labelColumnTitle}</span>
              </div>

              <div style={{ position: 'relative', width: totalW }}>
                <div style={{ display: 'flex', height: 36, alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                  {weekGroups.map((g, i) => (
                    <div
                      key={i}
                      style={{ width: g.days * DAY_W, minWidth: g.days * DAY_W }}
                      className="text-xs font-semibold text-slate-500 px-2 overflow-hidden whitespace-nowrap border-r border-white/40"
                    >
                      {g.label}
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
                        style={{ width: DAY_W, minWidth: DAY_W }}
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

          {rows.map(({ allocation: alloc, member }, rowIdx) => {
            const bg = member.avatar_color || 'var(--apple-blue)';
            const ini = initials(member.name);
            const rawX = dateToX(alloc.start_date);
            const rawXEnd = dateToX(alloc.end_date) + DAY_W;
            const x = Math.max(0, rawX);
            const xEnd = Math.max(x, rawXEnd);
            const w = xEnd - x;
            const isDragging = dragging?.id === alloc.id;
            const hasConflict = conflicts[alloc.id];
            const color = alloc.project_color || 'var(--apple-blue)';
            const labelPrimary = alloc.project_name || member.name;
            const labelSecondary = alloc.task_name ? alloc.task_name : '';
            const barBg = {
              backgroundImage: 'linear-gradient(90deg, rgba(17,24,39,0.67), rgba(17,24,39,0.50))',
            };

            return (
              <div
                key={alloc.id}
                style={{ display: 'flex', height: ROW_H }}
                className={`border-b border-white/40 ${rowIdx % 2 === 0 ? 'bg-white/25' : 'bg-white/15'}`}
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
                    <p className="text-[10px] text-slate-500 truncate" title={labelPrimary}>
                      {labelPrimary}
                      {labelSecondary ? ` · ${labelSecondary}` : ''}
                    </p>
                  </div>
                  {showRowDelete && (
                    <button
                      type="button"
                      title="刪除此列（時間分配）"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleDeleteRow(e, alloc)}
                      className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    >
                      刪除
                    </button>
                  )}
                </div>

                <div style={{ position: 'relative', width: totalW, height: ROW_H }}>
                  {days.map((d, i) =>
                    isWeekend(d) ? (
                      <div
                        key={i}
                        style={{ position: 'absolute', left: i * DAY_W, top: 0, width: DAY_W, height: '100%' }}
                        className="bg-slate-200/35"
                      />
                    ) : null
                  )}

                  {(() => {
                    // today marker is pinned outside the scroll area
                    return null;
                  })()}

                  {w > 0 && (
                    <div style={{ position: 'absolute', left: x + 2, top: 14, width: w - 4, height: 28, zIndex: isDragging ? 20 : 5 }}>
                      <div
                        style={{
                          ...barBg,
                          borderRadius: 6,
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
                    </div>
                  )}

                  {ghost && dragging?.id === alloc.id && ghost.rowIdx === rowIdx && (() => {
                    const gx = dateToX(ghost.startDate);
                    const gxEnd = dateToX(ghost.endDate) + DAY_W;
                    const gw = gxEnd - gx;
                    if (gw <= 0) return null;
                    return (
                      <div style={{ position: 'absolute', left: gx + 2, top: 14, width: gw - 4, height: 28, zIndex: 30, pointerEvents: 'none' }}>
                        <div
                          style={{
                            ...barBg,
                            borderRadius: 6,
                            height: '100%',
                            boxShadow: ghost.conflict ? '0 0 0 2px #FF3B30, 0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.2)',
                            opacity: 0.85,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ color: 'white', fontSize: 11, fontWeight: 600, paddingLeft: 8, whiteSpace: 'nowrap' }}>
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

          {rows.length === 0 && (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm px-4 text-center">
              {emptyHint ?? '尚無時間分配（請在專案頁或使用「新增分配」建立）'}
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
          if (syncingRef.current) return;
          syncingRef.current = true;
          const sl = hScrollRef.current?.scrollLeft || 0;
          setScrollLeft(sl);
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
