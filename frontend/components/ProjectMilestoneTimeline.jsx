'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isValid,
  parseISO,
  startOfWeek,
  isWeekend,
  isToday,
} from 'date-fns';
import { api } from '../lib/api';
import { notifyMilestoneDataChanged } from '../lib/dashboard-sync';
import { GANTT_OFFSCREEN_DOT, barTouchesTimelineViewportLeft } from './ganttOffscreenDots';

const DEFAULT_DAY_W = 16;
const MIN_DAY_W = 12;
const MAX_DAY_W = 80;
const ROW_H = 56;
const LABEL_W = 228;
const INDICATOR_GUTTER_W = 14;
const PINNED_LEFT_W = LABEL_W + INDICATOR_GUTTER_W;
const HEADER_H_FULL = 80;
const BAR_H = 14;
const BAR_GAP = 4;

/** API DATE / ISO → YYYY-MM-DD */
function ymdFromApi(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && isValid(v)) return format(v, 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

function sortMilestones(ms) {
  return [...(ms || [])].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

function partitionEqual(pStart, pEnd, n) {
  if (n <= 0) return [];
  const total = differenceInCalendarDays(pEnd, pStart) + 1;
  if (total < 1) return [];
  if (n >= total) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (i < total) {
        const d = addDays(pStart, i);
        out.push({ start: d, end: d });
      } else {
        out.push({ start: pEnd, end: pEnd });
      }
    }
    return out;
  }
  const base = Math.floor(total / n);
  let rem = total % n;
  const out = [];
  let cur = pStart;
  for (let i = 0; i < n; i++) {
    const len = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    const s = cur;
    const e = addDays(s, len - 1);
    out.push({ start: s, end: e });
    cur = addDays(e, 1);
  }
  if (out.length) out[out.length - 1].end = pEnd;
  return out;
}

/**
 * 合併 DB 與預設：任一段 milestone 有 timeline_* 就用 DB；沒有的列仍用均等切分那一格。
 * 避免「只存到部分列」或新里程碑尚無日期時，整表被均等切分洗掉 → 拖曳後彈回。
 */
function buildSegments(project, milestones) {
  const ms = sortMilestones(milestones);
  if (!project?.start_date || !project?.end_date || !ms.length) return [];
  const pStart = parseISO(String(project.start_date).slice(0, 10));
  const pEnd = parseISO(String(project.end_date).slice(0, 10));
  if (!isValid(pStart) || !isValid(pEnd) || pEnd < pStart) return [];

  const parts = partitionEqual(pStart, pEnd, ms.length);
  return ms.map((m, i) => {
    const ts = ymdFromApi(m.timeline_start_date);
    const te = ymdFromApi(m.timeline_end_date);
    if (ts && te) {
      return {
        id: m.id,
        label: m.label,
        start: parseISO(ts),
        end: parseISO(te),
      };
    }
    return {
      id: m.id,
      label: m.label,
      start: parts[i]?.start ?? pStart,
      end: parts[i]?.end ?? pEnd,
    };
  });
}

function fmtYmd(d) {
  return format(d, 'yyyy-MM-dd');
}

function clampDate(d, lo, hi) {
  if (d < lo) return lo;
  if (d > hi) return hi;
  return d;
}

export default function ProjectMilestoneTimeline({
  projectId,
  project,
  rangeWeeks = 12,
  pastWeeks = 4,
  onProjectDatesSaved,
}) {
  const { data: milestones = [], mutate } = useSWR(
    projectId ? ['project-milestones', projectId] : null,
    () => api.getProjectMilestones(projectId)
  );
  const milestonesRef = useRef(milestones);
  milestonesRef.current = milestones;

  const canonical = useMemo(() => buildSegments(project, milestones), [project, milestones]);
  const canonKey = useMemo(
    () =>
      JSON.stringify(
        canonical.map((s) => [s.id, fmtYmd(s.start), fmtYmd(s.end)]) +
          (project?.start_date || '') +
          (project?.end_date || '')
      ),
    [canonical, project?.start_date, project?.end_date]
  );

  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  useEffect(() => {
    setDraft(null);
    draftRef.current = null;
  }, [canonKey]);

  const segments = draft ?? canonical;
  const today = useMemo(() => new Date(), []);
  const rangeStart = useMemo(
    () => startOfWeek(addDays(today, -pastWeeks * 7), { weekStartsOn: 1 }),
    [today, pastWeeks]
  );
  const totalDays = (pastWeeks + rangeWeeks) * 7 - 1;
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, totalDays) }),
    [rangeStart, totalDays]
  );
  const [dayW, setDayW] = useState(DEFAULT_DAY_W);
  const dayWRef = useRef(dayW);
  useEffect(() => {
    dayWRef.current = dayW;
  }, [dayW]);
  const totalW = days.length * dayW;
  const containerRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [timelineViewportW, setTimelineViewportW] = useState(0);
  const [showProjectSpan, setShowProjectSpan] = useState(true);

  const draggingRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  /** Bumps on drag-frame repaint so we read fresh `draftRef` without `setDraft` every mousemove. */
  const [dragTick, setPaint] = useState(0);
  const repaint = useCallback(() => setPaint((n) => n + 1), []);

  const displaySegs = useMemo(() => {
    if (dragActive && draftRef.current?.length) return draftRef.current;
    return segments;
  }, [dragActive, segments, dragTick]);

  const pStart = project?.start_date ? parseISO(String(project.start_date).slice(0, 10)) : null;
  const pEnd = project?.end_date ? parseISO(String(project.end_date).slice(0, 10)) : null;

  const dateToX = useCallback(
    (d) => {
      if (!d) return 0;
      const dd = d instanceof Date ? d : parseISO(String(d).slice(0, 10));
      return differenceInCalendarDays(dd, rangeStart) * dayW;
    },
    [rangeStart, dayW]
  );

  const xToDate = useCallback(
    (x) => {
      const idx = Math.round(x / dayW);
      return addDays(rangeStart, Math.max(0, Math.min(idx, days.length - 1)));
    },
    [rangeStart, days.length, dayW]
  );

  const initDraftFromCanonical = useCallback(() => {
    const init = canonical.map((s) => ({ ...s, start: new Date(s.start), end: new Date(s.end) }));
    draftRef.current = init;
    setDraft(init);
    return init;
  }, [canonical]);

  const onSegMouseDown = useCallback(
    (e, index, mode) => {
      if (!canonical.length) return;
      e.preventDefault();
      e.stopPropagation();
      initDraftFromCanonical();
      const snap = (draftRef.current || []).map((s) => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end),
      }));
      draggingRef.current = {
        kind: 'milestone',
        index,
        mode,
        /** 從這個螢幕 X 算總位移 → 換算成欄位，與主甘特一致、可雙向對齊滑鼠 */
        origClientX: e.clientX,
        snapshot: snap,
      };
      setDragActive(true);
    },
    [canonical.length, initDraftFromCanonical]
  );

  const onProjectBarMouseDown = useCallback(
    (e) => {
      if (!pStart || !pEnd) return;
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = {
        kind: 'project',
        origX: e.clientX,
        origStart: new Date(pStart),
        origEnd: new Date(pEnd),
        dxPx: 0,
      };
      setDragActive(true);
    },
    [pStart, pEnd]
  );

  useEffect(() => {
    if (!dragActive) return;

    let moveRaf = null;
    const scheduleMovePaint = () => {
      if (moveRaf != null) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null;
        repaint();
      });
    };

    const onMove = (e) => {
      const d = draggingRef.current;
      if (!d) return;

      if (d.kind === 'project') {
        const dx = e.clientX - d.origX;
        d.dxPx = Math.round(dx / dayW) * dayW;
        scheduleMovePaint();
        return;
      }

      const snap0 = d.snapshot;
      if (!snap0?.length || !pStart || !pEnd) return;

      const totalDx = e.clientX - d.origClientX;
      const snappedPx = Math.round(totalDx / dayW) * dayW;
      const base = snap0.map((s) => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end),
      }));
      const i = d.index;
      const n = base.length;

      if (d.mode === 'move') {
        const len = differenceInCalendarDays(snap0[i].end, snap0[i].start);
        const deltaDays = Math.round(snappedPx / dayW);
        let ns = addDays(snap0[i].start, deltaDays);
        let ne = addDays(ns, len);
        const prevEnd = i > 0 ? snap0[i - 1].end : null;
        const nextStart = i < n - 1 ? snap0[i + 1].start : null;
        if (prevEnd) ns = clampDate(ns, addDays(prevEnd, 1), pEnd);
        else ns = clampDate(ns, pStart, pEnd);
        if (nextStart) ne = clampDate(ne, pStart, addDays(nextStart, -1));
        else ne = clampDate(ne, pStart, pEnd);
        if (differenceInCalendarDays(ne, ns) < len) {
          ne = addDays(ns, len);
          if (nextStart && ne >= nextStart) {
            ne = addDays(nextStart, -1);
            ns = addDays(ne, -len);
          }
        }
        base[i] = { ...base[i], start: ns, end: ne };
      } else if (d.mode === 'resize-left') {
        let ns = xToDate(dateToX(snap0[i].start) + snappedPx);
        ns = clampDate(ns, i === 0 ? pStart : addDays(snap0[i - 1].end, 1), snap0[i].end);
        base[i].start = ns;
        if (i > 0) {
          base[i - 1].end = addDays(ns, -1);
          if (differenceInCalendarDays(base[i - 1].end, base[i - 1].start) < 0) {
            base[i - 1].end = new Date(base[i - 1].start);
          }
        }
      } else if (d.mode === 'resize-right') {
        let ne = xToDate(dateToX(snap0[i].end) + snappedPx);
        ne = clampDate(ne, snap0[i].start, i === n - 1 ? pEnd : addDays(snap0[i + 1].end, -1));
        base[i].end = ne;
        if (i < n - 1) {
          base[i + 1].start = addDays(ne, 1);
          if (differenceInCalendarDays(base[i + 1].end, base[i + 1].start) < 0) {
            base[i + 1].start = new Date(base[i + 1].end);
          }
        }
      }

      // Avoid setDraft on every mousemove (full Gantt re-render → lag). Ref + rAF repaint only.
      draftRef.current = base;
      scheduleMovePaint();
    };

    const onUp = async () => {
      const d = draggingRef.current;
      if (!d) {
        draggingRef.current = null;
        setDragActive(false);
        return;
      }
      if (d.kind === 'milestone') {
        const list = draftRef.current;
        if (list?.length) {
          const copy = list.map((s) => ({
            ...s,
            start: new Date(s.start),
            end: new Date(s.end),
          }));
          draftRef.current = copy;
          setDraft(copy);
        }
      }
      draggingRef.current = null;
      setDragActive(false);

      if (d.kind === 'project' && pStart && pEnd) {
        const deltaDays = Math.round((d.dxPx || 0) / dayW);
        let ns = addDays(d.origStart, deltaDays);
        let ne = addDays(d.origEnd, deltaDays);
        if (differenceInCalendarDays(ne, ns) < 0) return;
        try {
          await api.updateProject(projectId, {
            name: project.name,
            client_id: project.client_id ?? null,
            description: project.description ?? null,
            budget: project.budget ?? null,
            status: project.status,
            start_date: fmtYmd(ns),
            end_date: fmtYmd(ne),
            color: project.color || '#6366f1',
          });
          notifyMilestoneDataChanged();
          onProjectDatesSaved?.();
          await mutate();
        } catch (err) {
          console.error(err);
          alert(err?.message || '專案日期更新失敗');
        }
        return;
      }

      if (d.kind === 'milestone') {
        const list = draftRef.current;
        if (!list?.length) return;
        try {
          let saved = 0;
          for (const s of list) {
            const ns = fmtYmd(s.start);
            const ne = fmtYmd(s.end);
            const row = milestonesRef.current.find((m) => m.id === s.id);
            const priorTs = ymdFromApi(row?.timeline_start_date);
            const priorTe = ymdFromApi(row?.timeline_end_date);
            if (priorTs === ns && priorTe === ne) continue;
            await api.updateProjectMilestone(s.id, {
              timeline_start_date: ns,
              timeline_end_date: ne,
            });
            saved += 1;
          }
          if (saved > 0) {
            notifyMilestoneDataChanged();
            await mutate();
          }
          draftRef.current = null;
          setDraft(null);
        } catch (err) {
          console.error(err);
          const msg = String(err?.message || '');
          const hint404 =
            err?.status === 404
              ? '（若為 404，請在伺服器執行 docker compose build backend-dev && docker compose up -d backend-dev 更新後端）'
              : '';
          const hintDb =
            msg.includes('timeline') || err?.status === 500
              ? '（若為資料庫欄位錯誤，請在 Postgres 執行 migrations/20260514_milestone_timeline.sql）'
              : '';
          alert(`${msg || '里程碑時程儲存失敗'}${hint404}${hintDb}`);
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moveRaf != null) cancelAnimationFrame(moveRaf);
    };
  }, [
    dragActive,
    dayW,
    xToDate,
    dateToX,
    pStart,
    pEnd,
    projectId,
    project,
    mutate,
    onProjectDatesSaved,
    repaint,
  ]);

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
        } else weekNoInMonth += 1;
        cur = { label: isStartOfWeek ? format(d, 'MMM') : '', days: 1, weekNo: weekNoInMonth };
        groups.push(cur);
      } else cur.days += 1;
    }
    return groups;
  }, [days]);

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
        if (runStart === -1) {
          runStart = i;
          runSpan = 1;
        } else runSpan += 1;
      } else if (runStart !== -1) {
        stripes.push({ startIdx: runStart, span: runSpan });
        runStart = -1;
        runSpan = 0;
      }
    });
    if (runStart !== -1) stripes.push({ startIdx: runStart, span: runSpan });
    return stripes;
  }, [days]);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      // Match Gantt.jsx: Ctrl+wheel zoom; plain vertical wheel pans horizontally.
      // React onWheel is passive; native listener allows preventDefault.
      if (e.ctrlKey) {
        e.preventDefault();
        const cur = dayWRef.current;
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        const next = Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, cur * factor));
        if (Math.abs(next - cur) < 0.5) return;
        const rect = el.getBoundingClientRect();
        const cursorInTimeline = e.clientX - rect.left + el.scrollLeft - PINNED_LEFT_W;
        const dayUnderCursor = cursorInTimeline / cur;
        setDayW(next);
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const newScrollLeft = dayUnderCursor * next + PINNED_LEFT_W - (e.clientX - rect.left);
          containerRef.current.scrollLeft = Math.max(0, newScrollLeft);
        });
        return;
      }
      if (e.shiftKey) return;
      const dy = e.deltaY;
      if (dy === 0) return;
      e.preventDefault();
      el.scrollLeft += dy;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (!project?.start_date || !project?.end_date) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
        請先在專案資料中設定「開始／結束日期」，里程碑時程才能對齊甘特橫軸。
      </div>
    );
  }

  if (!milestones.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        尚未建立里程碑。請至「里程碑」分頁套用公版或新增後，再於此檢視分段時程。
      </div>
    );
  }

  const projectColor = project.color || '#6366f1';
  let projStart = pStart;
  let projEnd = pEnd;
  const pd = draggingRef.current;
  if (pd?.kind === 'project' && typeof pd.dxPx === 'number') {
    const deltaDays = Math.round(pd.dxPx / dayW);
    projStart = addDays(pd.origStart, deltaDays);
    projEnd = addDays(pd.origEnd, deltaDays);
  }

  const tw = timelineViewportW;
  const visT1 = Math.min(totalW, scrollLeft + Math.max(0, tw));
  const todayPx = dateToX(today) + dayW / 2;
  const barBg = { backgroundImage: 'linear-gradient(90deg, #1f2937, #374151)' };

  const rowsBodyH = displaySegs.length * ROW_H;

  return (
    <div className="surface overflow-hidden select-none rounded-[18px] border border-white/60">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-slate-200/80">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showProjectSpan}
            onChange={(e) => setShowProjectSpan(e.target.checked)}
            className="rounded border-slate-300"
          />
          在日期列顯示專案整體區間（半透明，可左右平移）
        </label>
        <p className="text-xs text-slate-500 max-w-xl">
          格線樣式與工作時程甘特一致（週末／隔週淡色、今日線、滾輪左右平移、Ctrl+滾輪縮放）。里程碑各自一列；拖曳放開後會寫入資料庫。
        </p>
      </div>

      <div
        ref={containerRef}
        className="gantt-scroll overflow-x-auto overflow-y-auto max-h-[min(70vh,720px)]"
        onScroll={(e) => setScrollLeft(e.target.scrollLeft)}
      >
        <div
          style={{
            width: PINNED_LEFT_W + totalW,
            position: 'relative',
            minHeight: HEADER_H_FULL + rowsBodyH,
          }}
        >
          <div
            className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-white/60"
            style={{ height: HEADER_H_FULL }}
          >
            <div className="flex h-full">
              <div
                style={{ width: LABEL_W, minWidth: LABEL_W }}
                className="flex px-4 border-r border-white/60 items-end pb-2 sticky left-0 z-30 bg-white/70 backdrop-blur"
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  里程碑
                </span>
              </div>
              <div
                style={{ width: INDICATOR_GUTTER_W }}
                className="sticky shrink-0 border-r border-slate-200/80 bg-slate-50/90 z-[29]"
              />
              <div style={{ position: 'relative', width: totalW }}>
                <div className="flex h-9 items-center border-b border-white/40">
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

                <div className="relative flex h-11 items-stretch border-b border-white/40">
                  {altWeekStripes.map((s, i) => (
                    <div
                      key={`altw-h-${i}`}
                      style={{
                        position: 'absolute',
                        left: s.startIdx * dayW,
                        top: 0,
                        width: s.span * dayW,
                        height: '100%',
                      }}
                      className="gantt-alt-week"
                    />
                  ))}
                  {days.map((d, i) =>
                    isWeekend(d) ? (
                      <div
                        key={`wk-h-${i}`}
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
                  <div className="relative z-[2] flex flex-1">
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
                            className={`text-xs font-medium mt-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                              isToday_ ? 'bg-indigo-500 text-white' : 'text-slate-500'
                            }`}
                          >
                            {format(d, 'd')}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {showProjectSpan && pStart && pEnd && (
                    <div
                      className="absolute left-0 right-0 bottom-1 z-[5] pointer-events-auto"
                      style={{ height: 7 }}
                      title="專案整體區間（拖曳平移）"
                    >
                      <div
                        role="slider"
                        tabIndex={0}
                        aria-label="專案整體時程"
                        className="absolute rounded-full cursor-grab active:cursor-grabbing shadow-sm ring-1 ring-white/40"
                        style={{
                          left: dateToX(projStart),
                          width: Math.max(dayW, dateToX(projEnd) + dayW - dateToX(projStart)),
                          top: 0,
                          height: 7,
                          background: projectColor,
                          opacity: 0.42,
                        }}
                        onMouseDown={onProjectBarMouseDown}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {displaySegs.map((seg, rowIdx) => {
            const rawX = dateToX(seg.start);
            const showRowDotLeft = barTouchesTimelineViewportLeft(rawX, scrollLeft, PINNED_LEFT_W);
            const showRowDotRight = tw > 0 && rawX >= visT1;

            return (
              <div
                key={seg.id}
                style={{ display: 'flex', height: ROW_H }}
                className={`border-b border-slate-200/60 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
              >
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className="flex items-center gap-2 px-3 border-r border-white/60 shrink-0 sticky left-0 z-10 bg-inherit"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-400" />
                  <span className="text-xs font-semibold text-slate-800 truncate" title={seg.label}>
                    {seg.label}
                  </span>
                </div>
                <div
                  style={{ width: INDICATOR_GUTTER_W, minWidth: INDICATOR_GUTTER_W }}
                  className={`sticky shrink-0 z-[15] flex items-center justify-center border-r border-slate-200/80 ${
                    rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  }`}
                >
                  {showRowDotLeft && (
                    <span
                      aria-hidden
                      className="pointer-events-none block"
                      style={{
                        width: GANTT_OFFSCREEN_DOT.width,
                        height: GANTT_OFFSCREEN_DOT.height,
                        borderRadius: GANTT_OFFSCREEN_DOT.borderRadius,
                        backgroundColor: GANTT_OFFSCREEN_DOT.backgroundColor,
                        boxShadow: GANTT_OFFSCREEN_DOT.boxShadow,
                      }}
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
                  {altWeekStripes.map((s, i) => (
                    <div
                      key={`altw-${seg.id}-${i}`}
                      style={{
                        position: 'absolute',
                        left: s.startIdx * dayW,
                        top: 0,
                        width: s.span * dayW,
                        height: '100%',
                      }}
                      className="gantt-alt-week"
                    />
                  ))}
                  {days.map((d, i) =>
                    isWeekend(d) ? (
                      <div
                        key={`w-${seg.id}-${i}`}
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
                        width: GANTT_OFFSCREEN_DOT.width,
                        height: GANTT_OFFSCREEN_DOT.height,
                        borderRadius: GANTT_OFFSCREEN_DOT.borderRadius,
                        backgroundColor: GANTT_OFFSCREEN_DOT.backgroundColor,
                        boxShadow: GANTT_OFFSCREEN_DOT.boxShadow,
                        position: 'absolute',
                        left: visT1 - 6,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 25,
                      }}
                    />
                  )}

                  <div
                    className="absolute rounded-md shadow-sm group z-10"
                    style={{
                      left: dateToX(seg.start),
                      width: Math.max(dayW, dateToX(seg.end) + dayW - dateToX(seg.start)),
                      top: (ROW_H - BAR_H) / 2,
                      height: BAR_H,
                      ...barBg,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="調整開始"
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100 rounded-l-md"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSegMouseDown(e, rowIdx, 'resize-left');
                      }}
                    />
                    <button
                      type="button"
                      aria-label="平移"
                      className="absolute inset-y-0 left-2 right-2 cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => onSegMouseDown(e, rowIdx, 'move')}
                    />
                    <button
                      type="button"
                      aria-label="調整結束"
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100 rounded-r-md"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSegMouseDown(e, rowIdx, 'resize-right');
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <div
            className="pointer-events-none absolute z-[7] bg-indigo-400/60"
            style={{
              left: PINNED_LEFT_W + todayPx,
              top: 0,
              width: 1.5,
              height: HEADER_H_FULL + rowsBodyH,
            }}
          />
        </div>
      </div>

      <div className="px-4 py-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>滾輪左右平移 · Ctrl + 滾輪縮放欄寬（與工作時程甘特相同）</span>
        <div className="flex gap-1 items-center">
          <span className="text-slate-400 mr-1">欄寬</span>
          {[12, 16, 20, 24].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDayW(w)}
              className={`text-[10px] px-2 py-1 rounded-md border ${dayW === w ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}
            >
              {w}px
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
