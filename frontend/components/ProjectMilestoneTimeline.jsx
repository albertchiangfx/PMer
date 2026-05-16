'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from 'react';
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
import { parseTimelineDetailNodes } from '../lib/timeline-detail-nodes';
import { GANTT_OFFSCREEN_DOT, barTouchesTimelineViewportLeft } from './ganttOffscreenDots';

const DEFAULT_DAY_W = 16;
const MIN_DAY_W = 12;
const MAX_DAY_W = 80;
const ROW_H = 28;
const LABEL_W = 228;
const INDICATOR_GUTTER_W = 14;
const PINNED_LEFT_W = LABEL_W + INDICATOR_GUTTER_W;
const HEADER_H_FULL = 80;
const BAR_H = 12;
/** 展開時進度條正下方細節格列（表格式、點格新增／移除） */
const DETAIL_RAIL_H = 14;
const BAR_GAP = 4;

/** 表頭：僅垂直日欄線（水平分割靠列 border） */
function timelineHeaderGridStyle(dayW, totalW, heightPx) {
  return {
    width: totalW,
    height: heightPx,
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 2,
    backgroundImage: `repeating-linear-gradient(to right, rgb(203 213 225) 0, rgb(203 213 225) 1px, transparent 1px, transparent ${dayW}px)`,
  };
}

/** 資料列：垂直日欄 + 列底水平線 */
function timelineBodyGridStyle(dayW, totalW) {
  return {
    width: totalW,
    height: '100%',
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 2,
    backgroundImage: `repeating-linear-gradient(to right, rgb(203 213 225) 0, rgb(203 213 225) 1px, transparent 1px, transparent ${dayW}px)`,
    boxShadow: 'inset 0 -1px 0 0 rgb(203 213 225)',
  };
}

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
    const detailNodes = parseTimelineDetailNodes(m.timeline_detail_nodes);
    const ts = ymdFromApi(m.timeline_start_date);
    const te = ymdFromApi(m.timeline_end_date);
    if (ts && te) {
      return {
        id: m.id,
        label: m.label,
        completed: !!m.completed,
        detailNodes,
        start: parseISO(ts),
        end: parseISO(te),
      };
    }
    return {
      id: m.id,
      label: m.label,
      completed: !!m.completed,
      detailNodes,
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

function shiftSegments(segments, deltaDays) {
  return segments.map((s) => ({
    ...s,
    start: addDays(s.start, deltaDays),
    end: addDays(s.end, deltaDays),
  }));
}

/** 專案起訖變更時，各里程碑依在舊區間內的比例映射到新區間 */
function remapSegmentsProportional(segments, oldStart, oldEnd, newStart, newEnd) {
  const oldTotal = Math.max(0, differenceInCalendarDays(oldEnd, oldStart));
  const newTotal = Math.max(0, differenceInCalendarDays(newEnd, newStart));
  if (!segments.length) return segments;
  return segments.map((s) => {
    const startOff = Math.max(0, differenceInCalendarDays(s.start, oldStart));
    const endOff = Math.max(startOff, differenceInCalendarDays(s.end, oldStart));
    let ns;
    let ne;
    if (oldTotal === 0) {
      ns = new Date(newStart);
      ne = new Date(newEnd);
    } else {
      ns = addDays(newStart, Math.round((startOff / oldTotal) * newTotal));
      ne = addDays(newStart, Math.round((endOff / oldTotal) * newTotal));
    }
    if (ne < ns) ne = ns;
    return { ...s, start: ns, end: ne };
  });
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
  /** 僅平移模式：滑鼠幾乎沒動時視為「點擊」以展開列，不寫入 PATCH */
  const miniMoveRef = useRef(false);
  const [expandedSegId, setExpandedSegId] = useState(null);

  const draggingRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  /** Bumps on drag-frame repaint so we read fresh `draftRef` without `setDraft` every mousemove. */
  const [dragTick, setPaint] = useState(0);
  const repaint = useCallback(() => setPaint((n) => n + 1), []);

  const displaySegs = useMemo(() => {
    const d = draggingRef.current;
    if (dragActive && draftRef.current?.length) {
      if (d?.kind === 'project' || d?.kind === 'milestone') return draftRef.current;
    }
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
    const init = canonical.map((s) => ({
      ...s,
      start: new Date(s.start),
      end: new Date(s.end),
      detailNodes: Array.isArray(s.detailNodes)
        ? s.detailNodes.map((n) => ({ id: n.id, date: n.date, label: n.label }))
        : [],
    }));
    draftRef.current = init;
    setDraft(init);
    return init;
  }, [canonical]);

  const onSegMouseDown = useCallback(
    (e, index, mode) => {
      if (!canonical.length) return;
      e.preventDefault();
      e.stopPropagation();
      miniMoveRef.current = false;
      initDraftFromCanonical();
      const snap = (draftRef.current || []).map((s) => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end),
        detailNodes: Array.isArray(s.detailNodes)
          ? s.detailNodes.map((n) => ({ ...n }))
          : [],
      }));
      draggingRef.current = {
        kind: 'milestone',
        index,
        mode,
        /** 從這個螢幕 X 算總位移 → 換算成欄位，與主甘特一致、可雙向對齊滑鼠 */
        origClientX: e.clientX,
        origClientY: e.clientY,
        snapshot: snap,
      };
      setDragActive(true);
    },
    [canonical.length, initDraftFromCanonical]
  );

  const onProjectBarMouseDown = useCallback(
    (e, mode = 'move') => {
      if (!pStart || !pEnd) return;
      e.preventDefault();
      e.stopPropagation();
      miniMoveRef.current = false;
      initDraftFromCanonical();
      const snap = (draftRef.current || []).map((s) => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end),
        detailNodes: Array.isArray(s.detailNodes)
          ? s.detailNodes.map((n) => ({ ...n }))
          : [],
      }));
      draggingRef.current = {
        kind: 'project',
        mode,
        origX: e.clientX,
        origClientX: e.clientX,
        origStart: new Date(pStart),
        origEnd: new Date(pEnd),
        snapshot: snap,
        dxPx: 0,
        previewStart: new Date(pStart),
        previewEnd: new Date(pEnd),
      };
      setDragActive(true);
    },
    [pStart, pEnd, initDraftFromCanonical]
  );

  const toggleMilestoneCompleted = useCallback(
    async (milestoneId) => {
      const row = milestonesRef.current.find((m) => m.id === milestoneId);
      if (!row) return;
      try {
        await api.updateProjectMilestone(milestoneId, { completed: !row.completed });
        notifyMilestoneDataChanged();
        await mutate();
      } catch (err) {
        alert(err?.message || '更新里程碑狀態失敗');
      }
    },
    [mutate]
  );

  const addTimelineDetailNode = useCallback(
    async (milestoneId, dateYmd) => {
      const row = milestonesRef.current.find((m) => m.id === milestoneId);
      if (!row) return;
      const label =
        typeof window !== 'undefined' ? window.prompt('細節說明（會儲存在此日期欄）', '') : '';
      if (label == null || !String(label).trim()) return;
      const existing = parseTimelineDetailNodes(row.timeline_detail_nodes);
      const id = `dn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const next = [...existing, { id, date: dateYmd, label: String(label).trim() }];
      try {
        await api.updateProjectMilestone(milestoneId, { timeline_detail_nodes: next });
        notifyMilestoneDataChanged();
        await mutate();
      } catch (err) {
        alert(err?.message || '儲存細節節點失敗');
      }
    },
    [mutate]
  );

  const removeTimelineDetailNode = useCallback(
    async (milestoneId, nodeId) => {
      const row = milestonesRef.current.find((m) => m.id === milestoneId);
      if (!row) return;
      const existing = parseTimelineDetailNodes(row.timeline_detail_nodes);
      const next = existing.filter((n) => n.id !== nodeId);
      try {
        await api.updateProjectMilestone(milestoneId, { timeline_detail_nodes: next });
        notifyMilestoneDataChanged();
        await mutate();
      } catch (err) {
        alert(err?.message || '移除失敗');
      }
    },
    [mutate]
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
        if (!d.snapshot?.length || !d.origStart || !d.origEnd) return;
        const snappedPx = Math.round((e.clientX - d.origClientX) / dayW) * dayW;

        if (d.mode === 'move') {
          const deltaDays = Math.round(snappedPx / dayW);
          d.dxPx = deltaDays * dayW;
          d.previewStart = addDays(d.origStart, deltaDays);
          d.previewEnd = addDays(d.origEnd, deltaDays);
          draftRef.current = shiftSegments(d.snapshot, deltaDays);
        } else if (d.mode === 'resize-left') {
          let ns = xToDate(dateToX(d.origStart) + snappedPx);
          ns = clampDate(ns, rangeStart, addDays(d.origEnd, -1));
          d.previewStart = ns;
          d.previewEnd = new Date(d.origEnd);
          draftRef.current = remapSegmentsProportional(
            d.snapshot,
            d.origStart,
            d.origEnd,
            d.previewStart,
            d.previewEnd
          );
          d.dxPx = 0;
        } else if (d.mode === 'resize-right') {
          let ne = xToDate(dateToX(d.origEnd) + snappedPx);
          ne = clampDate(ne, addDays(d.origStart, 1), addDays(rangeStart, days.length - 1));
          d.previewStart = new Date(d.origStart);
          d.previewEnd = ne;
          draftRef.current = remapSegmentsProportional(
            d.snapshot,
            d.origStart,
            d.origEnd,
            d.previewStart,
            d.previewEnd
          );
          d.dxPx = 0;
        }
        scheduleMovePaint();
        return;
      }

      const snap0 = d.snapshot;
      if (!snap0?.length || !pStart || !pEnd) return;

      const totalDx = e.clientX - d.origClientX;
      if (d.mode === 'move') {
        const dy = e.clientY - (d.origClientY ?? e.clientY);
        if (Math.abs(totalDx) > 4 || Math.abs(dy) > 4) miniMoveRef.current = true;
      }
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

      const wasMilestoneClickNoMove =
        d.kind === 'milestone' && d.mode === 'move' && !miniMoveRef.current;

      if (d.kind === 'milestone' && !wasMilestoneClickNoMove) {
        const list = draftRef.current;
        if (list?.length) {
          const copy = list.map((s) => ({
            ...s,
            start: new Date(s.start),
            end: new Date(s.end),
            detailNodes: Array.isArray(s.detailNodes)
              ? s.detailNodes.map((n) => ({ ...n }))
              : [],
          }));
          draftRef.current = copy;
          setDraft(copy);
        }
      }
      draggingRef.current = null;
      setDragActive(false);

      if (wasMilestoneClickNoMove) {
        const sid = d.snapshot[d.index]?.id;
        if (sid) setExpandedSegId((cur) => (cur === sid ? null : sid));
        draftRef.current = null;
        setDraft(null);
        return;
      }

      if (d.kind === 'project' && pStart && pEnd) {
        const ns = d.previewStart || addDays(d.origStart, Math.round((d.dxPx || 0) / dayW));
        const ne = d.previewEnd || addDays(d.origEnd, Math.round((d.dxPx || 0) / dayW));
        if (differenceInCalendarDays(ne, ns) < 0) return;
        const list = draftRef.current;
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
          if (list?.length) {
            for (const s of list) {
              const row = milestonesRef.current.find((m) => m.id === s.id);
              const priorTs = ymdFromApi(row?.timeline_start_date);
              const priorTe = ymdFromApi(row?.timeline_end_date);
              const nextTs = fmtYmd(s.start);
              const nextTe = fmtYmd(s.end);
              if (priorTs === nextTs && priorTe === nextTe) continue;
              await api.updateProjectMilestone(s.id, {
                timeline_start_date: nextTs,
                timeline_end_date: nextTe,
              });
            }
          }
          notifyMilestoneDataChanged();
          onProjectDatesSaved?.();
          await mutate();
          draftRef.current = null;
          setDraft(null);
        } catch (err) {
          console.error(err);
          alert(err?.message || '專案／里程碑時程更新失敗');
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
    rangeStart,
    days.length,
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
  if (pd?.kind === 'project' && pd.previewStart && pd.previewEnd) {
    projStart = pd.previewStart;
    projEnd = pd.previewEnd;
  }

  const tw = timelineViewportW;
  const visT1 = Math.min(totalW, scrollLeft + Math.max(0, tw));
  const todayPx = dateToX(today) + dayW / 2;
  const barBg = { backgroundImage: 'linear-gradient(90deg, #1f2937, #374151)' };

  let rowsBodyH = 0;
  for (const s of displaySegs) {
    rowsBodyH += ROW_H;
    if (expandedSegId === s.id) rowsBodyH += DETAIL_RAIL_H;
  }

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
          格線樣式與工作時程甘特一致（週末淡色、今日線、滾輪左右平移、Ctrl+滾輪縮放）。進度條中央輕點可展開／收合條下日期細格（空白格點擊新增、填色格點擊移除）；拖曳平移／左右緣調整仍會寫入資料庫。左側名稱點擊可標記完成（綠色）。
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
            className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-300"
            style={{ height: HEADER_H_FULL }}
          >
            <div className="flex h-full">
              <div
                style={{ width: LABEL_W, minWidth: LABEL_W }}
                className="flex px-4 border-r border-slate-300 items-end pb-2 sticky left-0 z-30 bg-white/80 backdrop-blur"
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  里程碑
                </span>
              </div>
              <div
                style={{ width: INDICATOR_GUTTER_W }}
                className="sticky shrink-0 border-r border-slate-300 bg-white z-[29]"
              />
              <div style={{ position: 'relative', width: totalW, height: HEADER_H_FULL }}>
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0"
                  style={timelineHeaderGridStyle(dayW, totalW, HEADER_H_FULL)}
                />
                <div className="relative z-[3] flex flex-col h-full">
                <div className="flex h-9 items-center border-b border-slate-300 shrink-0">
                  {weekGroups.map((g, i) => (
                    <div
                      key={i}
                      style={{ width: g.days * dayW, minWidth: g.days * dayW }}
                      className="flex items-baseline gap-1.5 text-xs font-semibold text-slate-500 px-2 overflow-hidden whitespace-nowrap"
                    >
                      <span>{g.label}</span>
                      <span className="text-[9px] font-medium text-slate-400 tabular-nums">
                        W{g.weekNo}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="relative flex flex-1 min-h-0 h-11 items-stretch border-b border-slate-300">
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
                          zIndex: 1,
                        }}
                        className="gantt-weekend"
                      />
                    ) : null
                  )}
                  <div className="relative z-[4] flex flex-1">
                    {days.map((d, i) => {
                      const isToday_ = isToday(d);
                      const isWknd = isWeekend(d);
                      return (
                        <div
                          key={i}
                          style={{ width: dayW, minWidth: dayW }}
                          className={`flex flex-col items-center justify-center h-full ${isWknd ? 'opacity-40' : ''}`}
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
                      className="absolute left-0 right-0 bottom-1 z-[5] pointer-events-auto group"
                      style={{ height: 9 }}
                      title="專案整體區間（拖曳平移；左右緣調整起訖，底下里程碑會連動）"
                    >
                      <div
                        className="absolute rounded shadow-sm ring-1 ring-white/40"
                        style={{
                          left: dateToX(projStart),
                          width: Math.max(dayW, dateToX(projEnd) + dayW - dateToX(projStart)),
                          top: 0,
                          height: 9,
                          background: projectColor,
                          opacity: 0.42,
                        }}
                      >
                        <button
                          type="button"
                          aria-label="調整專案開始"
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l bg-white/30 opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onProjectBarMouseDown(e, 'resize-left');
                          }}
                        />
                        <button
                          type="button"
                          aria-label="平移專案區間"
                          className="absolute inset-y-0 left-2 right-2 cursor-grab active:cursor-grabbing rounded"
                          onMouseDown={(e) => onProjectBarMouseDown(e, 'move')}
                        />
                        <button
                          type="button"
                          aria-label="調整專案結束"
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r bg-white/30 opacity-0 group-hover:opacity-100"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onProjectBarMouseDown(e, 'resize-right');
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>

          {displaySegs.map((seg, rowIdx) => {
            const rawX = dateToX(seg.start);
            const showRowDotLeft = barTouchesTimelineViewportLeft(rawX, scrollLeft, PINNED_LEFT_W);
            const showRowDotRight = tw > 0 && rawX >= visT1;
            const rowExpanded = expandedSegId === seg.id;
            const barTop = (ROW_H - BAR_H) / 2;
            const detailNodes = Array.isArray(seg.detailNodes) ? seg.detailNodes : [];

            return (
              <Fragment key={seg.id}>
                <div
                  style={{ display: 'flex', height: ROW_H }}
                  className="border-b border-slate-300 bg-white"
                >
                  <div
                    style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="flex flex-row items-start gap-2 px-2 py-1 border-r border-slate-300 shrink-0 sticky left-0 z-10 bg-white"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                        seg.completed ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleMilestoneCompleted(seg.id)}
                        className={`text-[11px] font-semibold truncate text-left hover:underline ${
                          seg.completed ? 'text-emerald-700' : 'text-slate-800'
                        }`}
                        title={seg.completed ? '標記為未完成' : '標記為完成'}
                      >
                        {seg.label}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{ width: INDICATOR_GUTTER_W, minWidth: INDICATOR_GUTTER_W }}
                    className="sticky shrink-0 z-[15] flex items-center justify-center border-r border-slate-300 bg-white"
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
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-0 top-0"
                      style={timelineBodyGridStyle(dayW, totalW)}
                    />
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
                            zIndex: 1,
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
                          top: barTop + BAR_H / 2,
                          transform: 'translate(-50%, -50%)',
                          zIndex: 25,
                        }}
                      />
                    )}

                    <div
                      className="absolute rounded shadow-sm group z-10"
                      style={{
                        left: dateToX(seg.start),
                        width: Math.max(dayW, dateToX(seg.end) + dayW - dateToX(seg.start)),
                        top: barTop,
                        height: BAR_H,
                        ...(seg.completed
                          ? { backgroundImage: 'linear-gradient(90deg, #059669, #10b981)' }
                          : barBg),
                      }}
                    >
                      <button
                        type="button"
                        aria-label="調整開始"
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100 rounded-l"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onSegMouseDown(e, rowIdx, 'resize-left');
                        }}
                      />
                      <button
                        type="button"
                        aria-label="平移（小範圍點擊可展開／收合細節列）"
                        title="拖曳以平移；點擊展開或收合下一列細節格"
                        className="absolute inset-y-0 left-2 right-2 cursor-grab active:cursor-grabbing"
                        onMouseDown={(e) => onSegMouseDown(e, rowIdx, 'move')}
                      />
                      <button
                        type="button"
                        aria-label="調整結束"
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100 rounded-r"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onSegMouseDown(e, rowIdx, 'resize-right');
                        }}
                      />
                    </div>
                  </div>
                </div>

                {rowExpanded && (
                  <div
                    style={{ display: 'flex', height: DETAIL_RAIL_H }}
                    className="border-b border-slate-300 bg-white"
                  >
                    <div
                      style={{ width: LABEL_W, minWidth: LABEL_W }}
                      className="flex items-center px-2 border-r border-slate-300 shrink-0 sticky left-0 z-10 bg-white"
                    >
                      <span className="text-[9px] text-slate-400 leading-tight">
                        細節（空白格新增 · 灰格移除 · 點進度條收合）
                      </span>
                    </div>
                    <div
                      style={{ width: INDICATOR_GUTTER_W, minWidth: INDICATOR_GUTTER_W }}
                      className="sticky shrink-0 z-[15] border-r border-slate-300 bg-white"
                    />
                    <div
                      style={{
                        position: 'relative',
                        width: totalW,
                        height: DETAIL_RAIL_H,
                        isolation: 'isolate',
                      }}
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-0"
                        style={timelineBodyGridStyle(dayW, totalW)}
                      />
                      {days.map((d, i) =>
                        isWeekend(d) ? (
                          <div
                            key={`w2-${seg.id}-${i}`}
                            style={{
                              position: 'absolute',
                              left: i * dayW,
                              top: 0,
                              width: dayW,
                              height: '100%',
                              zIndex: 1,
                            }}
                            className="gantt-weekend"
                          />
                        ) : null
                      )}
                      <div className="relative z-[12] flex h-full w-full">
                        {days.map((d, i) => {
                          const ymd = fmtYmd(d);
                          const onThisDay = detailNodes.filter((n) => n.date === ymd);
                          if (onThisDay.length > 0) {
                            const titles = onThisDay.map((n) => n.label).join(' · ');
                            return (
                              <button
                                key={`dn-${seg.id}-${i}`}
                                type="button"
                                aria-label={`${ymd} 細節節點，點擊移除`}
                                title={`${ymd} ${titles}（點擊移除）`}
                                className="shrink-0 box-border p-0 min-h-0 bg-slate-300/30 hover:bg-slate-300/50"
                                style={{ width: dayW, minWidth: dayW, height: '100%' }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onThisDay.length === 1) {
                                    if (
                                      typeof window !== 'undefined' &&
                                      !window.confirm(`移除「${onThisDay[0].label}」？`)
                                    )
                                      return;
                                    removeTimelineDetailNode(seg.id, onThisDay[0].id);
                                    return;
                                  }
                                  const first = onThisDay[0];
                                  if (
                                    typeof window !== 'undefined' &&
                                    window.confirm(
                                      `此日有 ${onThisDay.length} 個節點，將先移除「${first.label}」`
                                    )
                                  ) {
                                    removeTimelineDetailNode(seg.id, first.id);
                                  }
                                }}
                              />
                            );
                          }
                          return (
                            <button
                              key={`dn-add-${seg.id}-${i}`}
                              type="button"
                              aria-label={`${ymd} 新增細節節點`}
                              title={`${ymd} — 點擊新增`}
                              className="shrink-0 box-border p-0 min-h-0 bg-transparent hover:bg-slate-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-400"
                              style={{ width: dayW, minWidth: dayW, height: '100%' }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                addTimelineDetailNode(seg.id, ymd);
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
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
