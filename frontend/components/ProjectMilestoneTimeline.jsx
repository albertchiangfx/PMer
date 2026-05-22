'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  isWeekend,
  isToday,
} from 'date-fns';
import { api } from '../lib/api';
import { notifyMilestoneDataChanged } from '../lib/dashboard-sync';
import {
  NODE_KINDS,
  nodeKindMeta,
  parseTimelineDetailNodes,
} from '../lib/timeline-detail-nodes';
import { exportClientTimeline } from '../lib/client-timeline-export';
import {
  ADDABLE_HOLIDAY_COUNTRIES,
  BASE_HOLIDAY_COUNTRIES,
  countWorkingDaysInclusive,
  countryLabel,
  holidayTooltip,
  loadEnabledHolidayCountries,
  loadHolidayIndex,
  saveEnabledHolidayCountries,
} from '../lib/public-holidays';
import { GANTT_OFFSCREEN_DOT, barTouchesTimelineViewportLeft } from './ganttOffscreenDots';

const DEFAULT_DAY_W = 16;
const MIN_DAY_W = 12;
const MAX_DAY_W = 80;
const LABEL_W = 156;
const INDICATOR_GUTTER_W = 14;
const PINNED_LEFT_W = LABEL_W + INDICATOR_GUTTER_W;
const ROW_MONTH_H = 22;
const ROW_DATE_H = 36;
const ROW_PROJECT_H = 30;
const ROW_MS_ROW_H = 28;
const MS_BAR_RADIUS = 4;
const PINNED_Z = 100;
const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

const MILESTONE_COLORS = [
  '#c7d2fe',
  '#bae6fd',
  '#a7f3d0',
  '#fde68a',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
];

function buildMonthBands(days) {
  const bands = [];
  let band = 0;
  let prev = null;
  for (const d of days) {
    const k = format(d, 'yyyy-MM');
    if (prev !== null && k !== prev) band += 1;
    bands.push(band % 2 === 0 ? 'month-band-a' : 'month-band-b');
    prev = k;
  }
  return bands;
}

/** 垂直格線對齊日欄右緣（與 border-r 一致），最左緣不畫線 */
function timelineBodyGridStyle(dayW, totalW) {
  const lineAt = Math.max(0, dayW - 1);
  return {
    width: totalW,
    height: '100%',
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 2,
    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${lineAt}px, rgb(203 213 225) ${lineAt}px, rgb(203 213 225) ${dayW}px)`,
    boxShadow: 'inset 0 -1px 0 0 rgb(203 213 225)',
  };
}

/** 將色條裁在圖表寬度內，避免捲動時畫進左側標籤欄 */
function barLayoutInChart(start, end, dateToX, dayW, chartW) {
  const rawLeft = dateToX(start);
  const rawRight = dateToX(end) + dayW;
  const left = Math.max(0, rawLeft);
  const right = Math.min(chartW, rawRight);
  const width = right - left;
  if (width <= 0) return null;
  return {
    left,
    width,
    rawLeft,
    roundLeft: rawLeft >= 0,
    roundRight: rawRight <= chartW,
  };
}

function barBorderRadius(roundLeft, roundRight, r = MS_BAR_RADIUS) {
  const tl = roundLeft ? r : 0;
  const tr = roundRight ? r : 0;
  return `${tl}px ${tr}px ${tr}px ${tl}px`;
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

function shiftDetailNodes(nodes, deltaDays, segStart, segEnd) {
  if (!nodes?.length) return [];
  return nodes.map((n) => {
    const nd = parseISO(String(n.date).slice(0, 10));
    if (!isValid(nd)) return n;
    let newD = addDays(nd, deltaDays);
    newD = clampDate(newD, segStart, segEnd);
    return { ...n, date: fmtYmd(newD) };
  });
}

function remapDetailNodes(nodes, oldStart, oldEnd, newStart, newEnd) {
  if (!nodes?.length) return [];
  const oldTotal = Math.max(0, differenceInCalendarDays(oldEnd, oldStart));
  const newTotal = Math.max(0, differenceInCalendarDays(newEnd, newStart));
  return nodes.map((n) => {
    const nd = parseISO(String(n.date).slice(0, 10));
    if (!isValid(nd)) return n;
    let off = Math.max(0, differenceInCalendarDays(nd, oldStart));
    off = Math.min(off, oldTotal);
    let newD;
    if (oldTotal === 0) {
      newD = new Date(newStart);
    } else {
      newD = addDays(newStart, Math.round((off / oldTotal) * newTotal));
    }
    newD = clampDate(newD, newStart, newEnd);
    return { ...n, date: fmtYmd(newD) };
  });
}

function shiftSegments(segments, deltaDays) {
  return segments.map((s) => {
    const ns = addDays(s.start, deltaDays);
    const ne = addDays(s.end, deltaDays);
    return {
      ...s,
      start: ns,
      end: ne,
      detailNodes: shiftDetailNodes(s.detailNodes, deltaDays, ns, ne),
    };
  });
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
    return {
      ...s,
      start: ns,
      end: ne,
      detailNodes: remapDetailNodes(s.detailNodes, s.start, s.end, ns, ne),
    };
  });
}

export default function ProjectMilestoneTimeline({
  projectId,
  project,
  rangeWeeks = 12,
  pastWeeks = 4,
  onProjectDatesSaved,
  /** 手機預覽：僅顯示、不可拖曳／改期／新增節點 */
  readOnly = false,
}) {
  const { data: milestones = [], mutate } = useSWR(
    projectId ? ['project-milestones', projectId] : null,
    () => api.getProjectMilestones(projectId)
  );
  const milestonesRef = useRef(milestones);
  milestonesRef.current = milestones;

  const applyListToMilestoneCache = useCallback((list) => {
    const cur = milestonesRef.current;
    if (!Array.isArray(cur) || !list?.length) return cur;
    return cur.map((m) => {
      const s = list.find((x) => x.id === m.id);
      if (!s) return m;
      return {
        ...m,
        timeline_start_date: fmtYmd(s.start),
        timeline_end_date: fmtYmd(s.end),
        timeline_detail_nodes: Array.isArray(s.detailNodes)
          ? s.detailNodes.map((n) => ({ id: n.id, date: n.date, label: n.label, kind: n.kind }))
          : [],
      };
    });
  }, []);

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
  const pStart = project?.start_date ? parseISO(String(project.start_date).slice(0, 10)) : null;
  const pEnd = project?.end_date ? parseISO(String(project.end_date).slice(0, 10)) : null;
  const [dayW, setDayW] = useState(DEFAULT_DAY_W);
  const dayWRef = useRef(dayW);
  useEffect(() => {
    dayWRef.current = dayW;
  }, [dayW]);
  const containerRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollLeftRef = useRef(0);
  const pendingScrollRestoreRef = useRef(null);
  /** 拖曳／儲存期間凍結日欄，避免 coreDays 重算造成整圖位移 */
  const layoutFreezeRef = useRef(null);
  const [timelineViewportW, setTimelineViewportW] = useState(0);

  const scheduleScrollRestore = useCallback(() => {
    const left = pendingScrollRestoreRef.current;
    if (left == null) {
      layoutFreezeRef.current = null;
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (el) {
          el.scrollLeft = left;
          scrollLeftRef.current = left;
          setScrollLeft(left);
        }
        pendingScrollRestoreRef.current = null;
        layoutFreezeRef.current = null;
      });
    });
  }, []);

  const captureScrollBeforeSave = useCallback(() => {
    pendingScrollRestoreRef.current =
      containerRef.current?.scrollLeft ?? scrollLeftRef.current;
  }, []);

  const clearLayoutFreeze = useCallback(() => {
    layoutFreezeRef.current = null;
    pendingScrollRestoreRef.current = null;
  }, []);

  /** 專案前後留出可拖曳緩衝（整月對齊 + 週數由 pastWeeks / rangeWeeks 控制） */
  const coreDays = useMemo(() => {
    const fallbackEnd = addDays(rangeStart, totalDays);
    let start = rangeStart;
    let end = fallbackEnd;

    if (pStart && pEnd && isValid(pStart) && isValid(pEnd) && pEnd >= pStart) {
      start = startOfMonth(addDays(pStart, -pastWeeks * 7));
      end = endOfMonth(addDays(pEnd, rangeWeeks * 7));

      for (const s of canonical) {
        if (s.start && isValid(s.start)) {
          const segPad = startOfMonth(addDays(s.start, -pastWeeks * 7));
          if (segPad < start) start = segPad;
        }
        if (s.end && isValid(s.end)) {
          const segPad = endOfMonth(addDays(s.end, rangeWeeks * 7));
          if (segPad > end) end = segPad;
        }
      }
    }

    return eachDayOfInterval({ start, end });
  }, [pStart, pEnd, rangeStart, totalDays, pastWeeks, rangeWeeks, canonical]);

  /** 欄數不足時向左右補日，讓泳道至少填滿可視寬度 */
  const displayDays = useMemo(() => {
    if (!coreDays.length) return coreDays;
    let start = coreDays[0];
    let end = coreDays[coreDays.length - 1];
    if (timelineViewportW > 0 && dayW > 0) {
      const needed = Math.ceil(timelineViewportW / dayW);
      if (coreDays.length < needed) {
        const extra = needed - coreDays.length;
        const padBefore = Math.floor(extra / 2);
        const padAfter = extra - padBefore;
        start = addDays(start, -padBefore);
        end = addDays(end, padAfter);
      }
    }
    if (start === coreDays[0] && end === coreDays[coreDays.length - 1]) return coreDays;
    return eachDayOfInterval({ start, end });
  }, [coreDays, timelineViewportW, dayW]);

  const days = displayDays;
  const timelineStart = days[0] ?? rangeStart;
  const layoutDays =
    layoutFreezeRef.current?.days?.length ? layoutFreezeRef.current.days : days;
  const layoutTimelineStart =
    layoutFreezeRef.current?.timelineStart ?? timelineStart;
  const projectSpan = useMemo(() => {
    if (!pStart || !pEnd || !layoutDays.length) return null;
    const i0 = differenceInCalendarDays(pStart, layoutTimelineStart);
    const i1 = differenceInCalendarDays(pEnd, layoutTimelineStart);
    return {
      startIdx: Math.max(0, i0),
      endIdx: Math.min(layoutDays.length - 1, i1),
    };
  }, [pStart, pEnd, layoutDays.length, layoutTimelineStart]);
  const totalW = layoutDays.length * dayW;
  const chartMinW = Math.max(totalW, timelineViewportW);

  /** 僅平移模式：滑鼠幾乎沒動時視為「點擊」，不寫入 PATCH */
  const miniMoveRef = useRef(false);
  /** 在節點列新增節點時，預設歸屬的里程碑 */
  const [activeSegId, setActiveSegId] = useState(null);
  const [nodeCreateModal, setNodeCreateModal] = useState(null);
  const [nodeCreateSaving, setNodeCreateSaving] = useState(false);

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

  const allDetailNodesFlat = useMemo(() => {
    const items = [];
    for (const s of displaySegs) {
      for (const n of s.detailNodes || []) {
        items.push({
          milestoneLabel: s.label,
          date: n.date,
          label: n.label,
          kind: n.kind,
          segId: s.id,
          id: n.id,
        });
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || a.milestoneLabel.localeCompare(b.milestoneLabel));
    return items;
  }, [displaySegs]);

  const dateToX = useCallback(
    (d) => {
      if (!d) return 0;
      const dd = d instanceof Date ? d : parseISO(String(d).slice(0, 10));
      const ts = layoutFreezeRef.current?.timelineStart ?? timelineStart;
      return differenceInCalendarDays(dd, ts) * dayW;
    },
    [timelineStart, dayW]
  );

  const xToDate = useCallback(
    (x) => {
      const ts = layoutFreezeRef.current?.timelineStart ?? timelineStart;
      const len = layoutFreezeRef.current?.days?.length ?? days.length;
      const idx = Math.round(x / dayW);
      return addDays(ts, Math.max(0, Math.min(idx, len - 1)));
    },
    [timelineStart, days.length, dayW]
  );

  const monthSpans = useMemo(() => {
    const parts = [];
    let i = 0;
    let monthIdx = 0;
    while (i < layoutDays.length) {
      const key = format(layoutDays[i], 'yyyy-MM');
      let j = i + 1;
      while (j < layoutDays.length && format(layoutDays[j], 'yyyy-MM') === key) j++;
      parts.push({
        startIdx: i,
        span: j - i,
        label: format(layoutDays[i], 'yyyy年M月'),
        alt: monthIdx % 2,
      });
      i = j;
      monthIdx += 1;
    }
    return parts;
  }, [layoutDays]);

  const monthBands = useMemo(() => buildMonthBands(layoutDays), [layoutDays]);

  const [enabledHolidayCountries, setEnabledHolidayCountries] = useState(() =>
    loadEnabledHolidayCountries(projectId)
  );
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const countryPickerRef = useRef(null);
  const [holidayYmdSet, setHolidayYmdSet] = useState(() => new Set());
  const [holidayByDate, setHolidayByDate] = useState(() => new Map());
  const [holidaysLoading, setHolidaysLoading] = useState(false);

  const extraHolidayCountries = useMemo(
    () => enabledHolidayCountries.filter((c) => !BASE_HOLIDAY_COUNTRIES.includes(c)),
    [enabledHolidayCountries]
  );

  const holidayCountries = enabledHolidayCountries;

  const holidayRangeKey = useMemo(() => {
    if (!layoutDays.length) return '';
    return `${fmtYmd(layoutDays[0])}|${fmtYmd(layoutDays[layoutDays.length - 1])}`;
  }, [layoutDays]);

  const holidayCountriesKey = holidayCountries.join(',');

  useEffect(() => {
    setEnabledHolidayCountries(loadEnabledHolidayCountries(projectId));
    setCountryPickerOpen(false);
  }, [projectId]);

  useEffect(() => {
    if (!countryPickerOpen) return undefined;
    const onDoc = (e) => {
      if (countryPickerRef.current?.contains(e.target)) return;
      setCountryPickerOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setCountryPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [countryPickerOpen]);

  useEffect(() => {
    if (!holidayRangeKey) return undefined;
    const [startYmd, endYmd] = holidayRangeKey.split('|');
    const rangeStart = parseISO(startYmd);
    const rangeEnd = parseISO(endYmd);
    if (!isValid(rangeStart) || !isValid(rangeEnd)) return undefined;

    let cancelled = false;
    setHolidaysLoading(true);
    loadHolidayIndex(rangeStart, rangeEnd, holidayCountries)
      .then(({ dateSet, byDate }) => {
        if (!cancelled) {
          setHolidayYmdSet(dateSet);
          setHolidayByDate(byDate);
        }
      })
      .catch((err) => {
        console.warn('load public holidays', err);
        if (!cancelled) {
          setHolidayYmdSet(new Set());
          setHolidayByDate(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) setHolidaysLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [holidayRangeKey, holidayCountriesKey]);

  const toggleHolidayCountry = useCallback(
    (code) => {
      setEnabledHolidayCountries((prev) => {
        const has = prev.includes(code);
        const next = has ? prev.filter((c) => c !== code) : [...prev, code];
        saveEnabledHolidayCountries(projectId, next);
        return next;
      });
    },
    [projectId]
  );

  const addExtraHolidayCountry = useCallback(
    (code) => {
      setEnabledHolidayCountries((prev) => {
        if (prev.includes(code)) return prev;
        const next = [...prev, code];
        saveEnabledHolidayCountries(projectId, next);
        return next;
      });
      setCountryPickerOpen(false);
    },
    [projectId]
  );

  const removeExtraHolidayCountry = useCallback(
    (code) => {
      setEnabledHolidayCountries((prev) => {
        const next = prev.filter((c) => c !== code);
        saveEnabledHolidayCountries(projectId, next);
        return next;
      });
    },
    [projectId]
  );

  const holidayChipCls = (on) =>
    `px-1.5 py-0.5 rounded border font-medium shrink-0 transition-colors ${
      on
        ? 'border-amber-400 bg-amber-50 text-amber-950'
        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
    }`;

  useEffect(() => {
    return () => {
      draggingRef.current = null;
      setDragActive(false);
      layoutFreezeRef.current = null;
    };
  }, [projectId]);

  const workingDaysBySegId = useMemo(() => {
    const m = new Map();
    for (const s of displaySegs) {
      m.set(s.id, countWorkingDaysInclusive(s.start, s.end, holidayYmdSet));
    }
    return m;
  }, [displaySegs, holidayYmdSet]);

  const msRowsH = displaySegs.length * ROW_MS_ROW_H;
  const chartBodyH = ROW_MONTH_H + ROW_DATE_H + ROW_PROJECT_H + msRowsH;

  const initDraftFromCanonical = useCallback(() => {
    const init = canonical.map((s) => ({
      ...s,
      start: new Date(s.start),
      end: new Date(s.end),
      detailNodes: Array.isArray(s.detailNodes)
        ? s.detailNodes.map((n) => ({ id: n.id, date: n.date, label: n.label, kind: n.kind }))
        : [],
    }));
    draftRef.current = init;
    setDraft(init);
    return init;
  }, [canonical]);

  const onSegMouseDown = useCallback(
    (e, index, mode) => {
      if (readOnly || !canonical.length) return;
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
      const segId = snap[index]?.id;
      if (segId) setActiveSegId(segId);
      layoutFreezeRef.current = {
        days: displayDays,
        timelineStart: displayDays[0] ?? rangeStart,
      };
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
    [readOnly, canonical.length, initDraftFromCanonical, displayDays, rangeStart]
  );

  const onProjectBarMouseDown = useCallback(
    (e, mode = 'move') => {
      if (readOnly || !pStart || !pEnd) return;
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
      layoutFreezeRef.current = {
        days: displayDays,
        timelineStart: displayDays[0] ?? rangeStart,
      };
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
    [readOnly, pStart, pEnd, initDraftFromCanonical, displayDays, rangeStart]
  );

  const toggleMilestoneCompleted = useCallback(
    async (milestoneId) => {
      if (readOnly) return;
      const row = milestonesRef.current.find((m) => m.id === milestoneId);
      if (!row) return;
      try {
        await api.updateProjectMilestone(milestoneId, { completed: !row.completed });
        notifyMilestoneDataChanged();
        await mutate();
      } catch (err) {
        alert(err?.message || '更新項目狀態失敗');
      }
    },
    [mutate]
  );

  const openNodeCreateModal = useCallback((milestoneId, dateYmd) => {
    if (readOnly) return;
    setActiveSegId(milestoneId);
    setNodeCreateModal({ milestoneId, dateYmd, kind: 'delivery', label: '' });
  }, []);

  const submitNodeCreate = useCallback(async () => {
    if (!nodeCreateModal) return;
    const { milestoneId, dateYmd, kind, label } = nodeCreateModal;
    const trimmed = String(label || '').trim();
    if (!trimmed) return;
    const row = milestonesRef.current.find((m) => m.id === milestoneId);
    if (!row) return;
    setNodeCreateSaving(true);
    try {
      const existing = parseTimelineDetailNodes(row.timeline_detail_nodes);
      const id = `dn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const next = [...existing, { id, date: dateYmd, label: trimmed, kind }];
      await api.updateProjectMilestone(milestoneId, { timeline_detail_nodes: next });
      notifyMilestoneDataChanged();
      await mutate();
      setNodeCreateModal(null);
    } catch (err) {
      alert(err?.message || '儲存細節節點失敗');
    } finally {
      setNodeCreateSaving(false);
    }
  }, [nodeCreateModal, mutate]);

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
          ns = clampDate(ns, timelineStart, addDays(d.origEnd, -1));
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
          const ts = layoutFreezeRef.current?.timelineStart ?? timelineStart;
          const len = layoutFreezeRef.current?.days?.length ?? days.length;
          ne = clampDate(ne, addDays(d.origStart, 1), addDays(ts, len - 1));
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

      if (d.mode === 'move') {
        const len = differenceInCalendarDays(snap0[i].end, snap0[i].start);
        const deltaDays = Math.round(snappedPx / dayW);
        let ns = addDays(snap0[i].start, deltaDays);
        let ne = addDays(ns, len);
        ns = clampDate(ns, pStart, pEnd);
        ne = clampDate(ne, pStart, pEnd);
        if (differenceInCalendarDays(ne, ns) < 0) {
          ne = new Date(ns);
        }
        const oldS = snap0[i].start;
        const oldE = snap0[i].end;
        base[i] = {
          ...base[i],
          start: ns,
          end: ne,
          detailNodes: shiftDetailNodes(snap0[i].detailNodes, differenceInCalendarDays(ns, oldS), ns, ne),
        };
      } else if (d.mode === 'resize-left') {
        let ns = xToDate(dateToX(snap0[i].start) + snappedPx);
        ns = clampDate(ns, pStart, snap0[i].end);
        const oldSi = snap0[i].start;
        const oldEi = snap0[i].end;
        base[i].start = ns;
        base[i].detailNodes = remapDetailNodes(snap0[i].detailNodes, oldSi, oldEi, ns, base[i].end);
      } else if (d.mode === 'resize-right') {
        let ne = xToDate(dateToX(snap0[i].end) + snappedPx);
        ne = clampDate(ne, snap0[i].start, pEnd);
        const oldSi = snap0[i].start;
        const oldEi = snap0[i].end;
        base[i].end = ne;
        base[i].detailNodes = remapDetailNodes(snap0[i].detailNodes, oldSi, oldEi, base[i].start, ne);
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
        if (sid) setActiveSegId(sid);
        draftRef.current = null;
        setDraft(null);
        clearLayoutFreeze();
        return;
      }

      captureScrollBeforeSave();

      if (d.kind === 'project' && pStart && pEnd) {
        const ns = d.previewStart || addDays(d.origStart, Math.round((d.dxPx || 0) / dayW));
        const ne = d.previewEnd || addDays(d.origEnd, Math.round((d.dxPx || 0) / dayW));
        if (differenceInCalendarDays(ne, ns) < 0) {
          clearLayoutFreeze();
          draftRef.current = null;
          setDraft(null);
          return;
        }
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
              const nextNodes = Array.isArray(s.detailNodes)
                ? s.detailNodes.map((n) => ({ id: n.id, date: n.date, label: n.label, kind: n.kind }))
                : [];
              const priorNodes = JSON.stringify(parseTimelineDetailNodes(row?.timeline_detail_nodes));
              const nextNodesJson = JSON.stringify(nextNodes);
              if (priorTs === nextTs && priorTe === nextTe && priorNodes === nextNodesJson) continue;
              await api.updateProjectMilestone(s.id, {
                timeline_start_date: nextTs,
                timeline_end_date: nextTe,
                ...(priorNodes !== nextNodesJson ? { timeline_detail_nodes: nextNodes } : {}),
              });
            }
          }
          notifyMilestoneDataChanged();
          if (list?.length) {
            const nextCache = applyListToMilestoneCache(list);
            await mutate(nextCache, { revalidate: false });
          }
          onProjectDatesSaved?.();
          scheduleScrollRestore();
          draftRef.current = null;
          setDraft(null);
        } catch (err) {
          console.error(err);
          clearLayoutFreeze();
          alert(err?.message || '專案／項目時程更新失敗');
        }
        return;
      }

      if (d.kind === 'milestone') {
        const list = draftRef.current;
        if (!list?.length) {
          clearLayoutFreeze();
          return;
        }
        try {
          let saved = 0;
          for (const s of list) {
            const ns = fmtYmd(s.start);
            const ne = fmtYmd(s.end);
            const row = milestonesRef.current.find((m) => m.id === s.id);
            const priorTs = ymdFromApi(row?.timeline_start_date);
            const priorTe = ymdFromApi(row?.timeline_end_date);
            const nextNodes = Array.isArray(s.detailNodes)
              ? s.detailNodes.map((n) => ({ id: n.id, date: n.date, label: n.label, kind: n.kind }))
              : [];
            const priorNodes = JSON.stringify(parseTimelineDetailNodes(row?.timeline_detail_nodes));
            const nextNodesJson = JSON.stringify(nextNodes);
            if (priorTs === ns && priorTe === ne && priorNodes === nextNodesJson) continue;
            await api.updateProjectMilestone(s.id, {
              timeline_start_date: ns,
              timeline_end_date: ne,
              ...(priorNodes !== nextNodesJson ? { timeline_detail_nodes: nextNodes } : {}),
            });
            saved += 1;
          }
          if (saved > 0) {
            notifyMilestoneDataChanged();
            const nextCache = applyListToMilestoneCache(list);
            await mutate(nextCache, { revalidate: false });
            scheduleScrollRestore();
          } else {
            clearLayoutFreeze();
          }
          draftRef.current = null;
          setDraft(null);
        } catch (err) {
          console.error(err);
          clearLayoutFreeze();
          const msg = String(err?.message || '');
          const hint404 =
            err?.status === 404
              ? '（若為 404，請在伺服器執行 docker compose build backend-dev && docker compose up -d backend-dev 更新後端）'
              : '';
          const hintDb =
            msg.includes('timeline') || err?.status === 500
              ? '（若為資料庫欄位錯誤，請在 Postgres 執行 migrations/20260514_milestone_timeline.sql）'
              : '';
          alert(`${msg || '項目時程儲存失敗'}${hint404}${hintDb}`);
        }
      }
    };

    const cancelDrag = () => {
      draggingRef.current = null;
      setDragActive(false);
      draftRef.current = null;
      setDraft(null);
      clearLayoutFreeze();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') cancelDrag();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', cancelDrag);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', cancelDrag);
      if (moveRaf != null) cancelAnimationFrame(moveRaf);
    };
  }, [
    dragActive,
    dayW,
    xToDate,
    dateToX,
    timelineStart,
    days.length,
    pStart,
    pEnd,
    projectId,
    project,
    mutate,
    onProjectDatesSaved,
    repaint,
    applyListToMilestoneCache,
    captureScrollBeforeSave,
    scheduleScrollRestore,
    clearLayoutFreeze,
  ]);

  const didInitialScroll = useRef(false);
  const initialScrollProjectIdRef = useRef(projectId);
  const chartReady = Boolean(
    project?.start_date && project?.end_date && milestones.length > 0
  );

  useEffect(() => {
    if (initialScrollProjectIdRef.current !== projectId) {
      didInitialScroll.current = false;
      initialScrollProjectIdRef.current = projectId;
    }
  }, [projectId]);

  useLayoutEffect(() => {
    if (!chartReady) return;
    const el = containerRef.current;
    if (el) setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
  }, [chartReady]);

  useEffect(() => {
    if (!chartReady) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
    });
    ro.observe(el);
    setTimelineViewportW(Math.max(0, el.clientWidth - PINNED_LEFT_W));
    return () => ro.disconnect();
  }, [chartReady]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (didInitialScroll.current || !el || !pStart || !layoutDays.length || timelineViewportW <= 0)
      return;
    const idx = differenceInCalendarDays(pStart, layoutTimelineStart);
    if (idx < 0) return;
    const left = Math.max(0, idx * dayW - 56);
    el.scrollLeft = left;
    scrollLeftRef.current = left;
    setScrollLeft(left);
    didInitialScroll.current = true;
  }, [projectId, layoutDays.length, timelineViewportW, dayW, pStart, layoutTimelineStart]);

  useEffect(() => {
    if (!chartReady) return;
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
  }, [chartReady]);

  if (!project?.start_date || !project?.end_date) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
        請先在專案資料中設定「開始／結束日期」，項目時程才能對齊甘特橫軸。
      </div>
    );
  }

  if (!milestones.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        尚未建立項目。請至「項目」分頁套用公版或新增後，再於此檢視分段時程。
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
  const visT1 = Math.min(chartMinW, scrollLeft + Math.max(0, tw));
  const todayPx = dateToX(today) + dayW / 2;

  const rowLabelCls =
    'flex items-center gap-1.5 px-2.5 text-[11px] font-semibold text-slate-700 border-b border-slate-200 bg-slate-50 shrink-0 text-left';
  const projBarLayout = barLayoutInChart(projStart, projEnd, dateToX, dayW, chartMinW);
  const projBarLeft = projBarLayout?.left ?? 0;
  const projBarW = projBarLayout?.width ?? 0;
  const projBarRadius = projBarLayout
    ? barBorderRadius(projBarLayout.roundLeft, projBarLayout.roundRight)
    : undefined;
  const showProjDotLeft = barTouchesTimelineViewportLeft(
    projBarLayout?.rawLeft ?? dateToX(projStart),
    scrollLeft,
    PINNED_LEFT_W
  );
  const showProjDotRight = tw > 0 && (projBarLayout?.rawLeft ?? 0) >= visT1;
  const projectWorkingDays =
    projStart && projEnd ? countWorkingDaysInclusive(projStart, projEnd, holidayYmdSet) : null;

  return (
    <div className="surface overflow-hidden rounded-[18px] border border-white/60">
      {readOnly ? (
        <div className="px-4 py-2.5 border-b border-amber-100 bg-amber-50/90 text-[12px] text-amber-950">
          僅供預覽，無法拖曳或編輯。請使用電腦版調整時程。
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3 px-4 pt-3 pb-2 border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div
            ref={countryPickerRef}
            className="relative flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 max-w-full"
          >
            <span className="font-semibold text-slate-500 shrink-0">國定假日</span>
            <span
              className="inline-block w-3 h-3 rounded-sm border border-amber-200/90 gantt-holiday shrink-0"
              title="淡琥珀色＝平日國定假日（直欄延伸至下方）"
            />
            {BASE_HOLIDAY_COUNTRIES.map((code) => {
              const on = enabledHolidayCountries.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleHolidayCountry(code)}
                  className={holidayChipCls(on)}
                  title={`${on ? '關閉' : '開啟'}${countryLabel(code)}國定假日標示`}
                  aria-pressed={on}
                >
                  {countryLabel(code)}
                </button>
              );
            })}
            {extraHolidayCountries.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-800 font-medium shrink-0"
              >
                {countryLabel(code)}
                <button
                  type="button"
                  onClick={() => removeExtraHolidayCountry(code)}
                  className="w-4 h-4 flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label={`移除${countryLabel(code)}國定假日`}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setCountryPickerOpen((o) => !o)}
              className="w-6 h-6 flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-500 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50/50 shrink-0 font-bold leading-none"
              title="新增其他國家國定假日"
              aria-expanded={countryPickerOpen}
            >
              +
            </button>
            {countryPickerOpen ? (
              <div className="absolute right-0 top-full mt-1 z-[300] min-w-[9rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {ADDABLE_HOLIDAY_COUNTRIES.filter((c) => !enabledHolidayCountries.includes(c.code))
                  .length === 0 ? (
                  <p className="px-3 py-2 text-slate-400 text-[10px]">已無可新增國家</p>
                ) : (
                  ADDABLE_HOLIDAY_COUNTRIES.filter((c) => !enabledHolidayCountries.includes(c.code)).map(
                    (c) => (
                      <button
                        key={c.code}
                        type="button"
                        className="block w-full text-left px-3 py-1.5 hover:bg-amber-50 text-slate-700"
                        onClick={() => addExtraHolidayCountry(c.code)}
                      >
                        {c.label}
                      </button>
                    )
                  )
                )}
              </div>
            ) : null}
            {holidaysLoading ? (
              <span className="text-slate-400 shrink-0">載入中…</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2.5 flex-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600">
            <span className="font-semibold text-slate-500 shrink-0">節點圖例</span>
            <ul className="flex items-center gap-x-2.5 flex-nowrap">
              {NODE_KINDS.map((k) => (
                <li key={k.id} className="flex items-center gap-1 shrink-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: k.color }}
                  />
                  {k.label}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const result = await exportClientTimeline(project, canonical);
                  if (result && !result.ok && result.message) alert(result.message);
                } catch (err) {
                  console.error(err);
                  alert(err?.message || '匯出失敗，請稍後再試。');
                }
              })();
            }}
            disabled={!canonical.length}
            className="rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="產生含專案、客戶、時間軸、項目、節點與預算的 HTML，可轉 PDF 寄給客戶"
          >
            匯出客戶時間軸
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold text-slate-500 shrink-0">選取項目</span>
        {displaySegs.map((seg, i) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => setActiveSegId(seg.id)}
            className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${
              activeSegId === seg.id
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            } ${seg.completed ? 'line-through opacity-70' : ''}`}
            style={{
              borderLeftWidth: 3,
              borderLeftColor: MILESTONE_COLORS[i % MILESTONE_COLORS.length],
            }}
          >
            {seg.label}
            <span className="text-slate-500 font-normal tabular-nums">
              （{workingDaysBySegId.get(seg.id) ?? '—'}工作天）
            </span>
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="gantt-scroll overflow-x-auto overflow-y-auto max-h-[min(70vh,720px)] select-none"
        onScroll={(e) => {
          const left = e.target.scrollLeft;
          scrollLeftRef.current = left;
          setScrollLeft(left);
        }}
      >
        <div
          style={{
            width: PINNED_LEFT_W + chartMinW,
            position: 'relative',
            minHeight: chartBodyH,
          }}
        >
          <div className="flex" style={{ minHeight: chartBodyH }}>
            <div
              className="sticky left-0 isolate flex shrink-0 bg-white border-r-2 border-slate-400 shadow-[10px_0_16px_-8px_rgba(255,255,255,1)]"
              style={{ width: PINNED_LEFT_W, zIndex: PINNED_Z }}
            >
              <div className="flex flex-col shrink-0" style={{ width: LABEL_W }}>
                <div className={rowLabelCls} style={{ height: ROW_MONTH_H }}>
                  月份
                </div>
                <div
                  className={`${rowLabelCls} pointer-events-none select-none`}
                  style={{ height: ROW_DATE_H }}
                >
                  日期
                </div>
                <div className={rowLabelCls} style={{ height: ROW_PROJECT_H }}>
                  <span>專案</span>
                  {projectWorkingDays != null ? (
                    <span className="text-[9px] text-slate-500 font-normal tabular-nums whitespace-nowrap">
                      · {projectWorkingDays}工作天
                    </span>
                  ) : null}
                </div>
                {displaySegs.map((seg, i) => (
                  <button
                    key={`lbl-${seg.id}`}
                    type="button"
                    disabled={readOnly}
                    onClick={() => void toggleMilestoneCompleted(seg.id)}
                    className={`${rowLabelCls} ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100'} ${
                      seg.completed ? 'text-emerald-800 bg-emerald-50/80' : ''
                    } ${activeSegId === seg.id ? 'ring-1 ring-inset ring-indigo-400' : ''}`}
                    style={{ height: ROW_MS_ROW_H }}
                    title={
                      seg.completed
                        ? `${seg.label} · ${workingDaysBySegId.get(seg.id) ?? '—'}工作天（已完成，點擊取消）`
                        : `${seg.label} · ${workingDaysBySegId.get(seg.id) ?? '—'}工作天（點擊標記完成）`
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-sm shrink-0 border border-slate-300"
                      style={{
                        backgroundColor: seg.completed
                          ? '#10b981'
                          : MILESTONE_COLORS[i % MILESTONE_COLORS.length],
                      }}
                    />
                    <span className="leading-tight line-clamp-2 break-words min-w-0 flex-1">
                      {seg.label}
                      <span className="text-[9px] text-slate-500 font-normal tabular-nums whitespace-nowrap">
                        {' '}
                        · {workingDaysBySegId.get(seg.id) ?? '—'}工作天
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div
                className="flex flex-col shrink-0 border-l border-slate-200 bg-white"
                style={{ width: INDICATOR_GUTTER_W }}
              >
                <div style={{ height: ROW_MONTH_H }} />
                <div style={{ height: ROW_DATE_H }} />
                <div
                  style={{ height: ROW_PROJECT_H }}
                  className="flex items-center justify-center"
                >
                  {showProjDotLeft && (
                    <span
                      aria-hidden
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
                {displaySegs.map((seg) => (
                  <div key={`gut-${seg.id}`} style={{ height: ROW_MS_ROW_H }} />
                ))}
              </div>
            </div>
            <div
              className="relative shrink-0 overflow-hidden z-[1]"
              style={{ width: chartMinW, minWidth: chartMinW, height: chartBodyH }}
            >
              {projectSpan && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute bg-indigo-50/35 border-x border-indigo-200/25"
                  style={{
                    left: projectSpan.startIdx * dayW,
                    width: (projectSpan.endIdx - projectSpan.startIdx + 1) * dayW,
                    top: ROW_MONTH_H,
                    height: chartBodyH - ROW_MONTH_H,
                    zIndex: 0,
                  }}
                />
              )}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={timelineBodyGridStyle(dayW, chartMinW)}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 z-[1]"
                style={{ top: ROW_MONTH_H, height: chartBodyH - ROW_MONTH_H }}
              >
                {layoutDays.map((d, i) => {
                  const wknd = isWeekend(d);
                  const ymdCell = fmtYmd(d);
                  if (wknd) {
                    return (
                      <div
                        key={`wk-col-${i}`}
                        className="gantt-weekend absolute top-0"
                        style={{ left: i * dayW, width: dayW, height: '100%' }}
                      />
                    );
                  }
                  if (holidayYmdSet.has(ymdCell)) {
                    return (
                      <div
                        key={`hol-col-${i}`}
                        className="gantt-holiday absolute top-0"
                        style={{ left: i * dayW, width: dayW, height: '100%' }}
                      />
                    );
                  }
                  return null;
                })}
              </div>
              {/* 月份列 */}
              <div
                className="absolute left-0 right-0 top-0 border-b border-slate-300"
                style={{ height: ROW_MONTH_H }}
              >
                {monthSpans.map((m) => (
                  <div
                    key={`${m.startIdx}-${m.label}`}
                    className={`absolute flex items-center justify-center text-[10px] font-bold text-slate-600 whitespace-nowrap border-r border-slate-300 ${
                      m.alt ? 'bg-slate-300' : 'bg-slate-200'
                    }`}
                    style={{
                      left: m.startIdx * dayW,
                      width: m.span * dayW,
                      height: ROW_MONTH_H,
                    }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* 日期列 */}
              <div
                className="absolute left-0 right-0 flex border-b border-slate-300 pointer-events-none select-none"
                style={{ top: ROW_MONTH_H, height: ROW_DATE_H }}
              >
                {layoutDays.map((d, i) => {
                  const wknd = isWeekend(d);
                  const band = monthBands[i];
                  const isToday_ = isToday(d);
                  const ymdCell = fmtYmd(d);
                  const hol = !wknd && holidayYmdSet.has(ymdCell);
                  const holTitle = hol ? holidayTooltip(ymdCell, holidayByDate) : '';
                  return (
                    <div
                      key={`hd-${i}`}
                      style={{ width: dayW, minWidth: dayW }}
                      title={holTitle || undefined}
                      className={`flex flex-col items-center justify-center shrink-0 border-r border-slate-200 ${
                        hol
                          ? 'gantt-holiday'
                          : wknd
                            ? 'bg-red-50/90'
                            : band === 'month-band-b'
                              ? 'bg-slate-100/90'
                              : 'bg-slate-50'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold leading-none ${
                          isToday_ ? 'text-indigo-600' : 'text-slate-700'
                        }`}
                      >
                        {format(d, 'd')}
                      </span>
                      <span className="text-[8px] text-slate-400 leading-none mt-0.5">
                        {WEEKDAYS_ZH[getDay(d)]}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* 專案列 */}
              <div
                className="absolute left-0 right-0 border-b border-slate-300"
                style={{ top: ROW_MONTH_H + ROW_DATE_H, height: ROW_PROJECT_H }}
              >
                <div className="absolute inset-0 flex z-[1]">
                  {layoutDays.map((d, i) => {
                    const ymdCell = fmtYmd(d);
                    const holTitle =
                      !isWeekend(d) && holidayYmdSet.has(ymdCell)
                        ? holidayTooltip(ymdCell, holidayByDate)
                        : '';
                    return (
                      <button
                        key={`proj-cell-${i}`}
                        type="button"
                        disabled={readOnly}
                        title={
                          holTitle
                            ? `${ymdCell} ${holTitle}`
                            : readOnly
                              ? ymdCell
                              : `${ymdCell} 新增節點（歸於目前選取的項目）`
                        }
                        className={`shrink-0 border-r border-slate-200/50 bg-transparent ${
                          readOnly ? '' : 'hover:bg-white/20'
                        }`}
                        style={{ width: dayW, minWidth: dayW, height: '100%' }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (readOnly) return;
                          const sid = activeSegId || displaySegs[0]?.id;
                          if (!sid) {
                            alert('請先點選項目列或上方標籤');
                            return;
                          }
                          openNodeCreateModal(sid, ymdCell);
                        }}
                      />
                    );
                  })}
                </div>
                <div
                  className={`absolute shadow-sm group overflow-hidden flex items-center justify-center z-[10] ${readOnly ? 'pointer-events-none' : ''}`}
                  style={{
                    left: projBarLeft,
                    width: projBarW,
                    top: 4,
                    height: ROW_PROJECT_H - 8,
                    borderRadius: projBarRadius,
                    background: `linear-gradient(90deg, ${projectColor}, ${projectColor}dd)`,
                  }}
                  title={
                    readOnly
                      ? '專案整體區間'
                      : '專案整體區間（拖曳平移；左右緣調整起訖，項目連動）'
                  }
                >
                  <span className="pointer-events-none text-[10px] font-bold text-white truncate px-2 max-w-full">
                    {project?.name || '專案'}
                  </span>
                  <button
                    type="button"
                    aria-label="調整專案開始"
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 opacity-0 group-hover:opacity-100"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onProjectBarMouseDown(e, 'resize-left');
                    }}
                  />
                  <button
                    type="button"
                    aria-label="平移專案區間"
                    className="absolute inset-y-0 left-2 right-2 cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => onProjectBarMouseDown(e, 'move')}
                  />
                  <button
                    type="button"
                    aria-label="調整專案結束"
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 opacity-0 group-hover:opacity-100"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onProjectBarMouseDown(e, 'resize-right');
                    }}
                  />
                </div>
                {showProjDotRight && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute z-[25]"
                    style={{
                      left: visT1 - 6,
                      top: ROW_PROJECT_H / 2,
                      transform: 'translate(-50%, -50%)',
                      width: GANTT_OFFSCREEN_DOT.width,
                      height: GANTT_OFFSCREEN_DOT.height,
                      borderRadius: GANTT_OFFSCREEN_DOT.borderRadius,
                      backgroundColor: GANTT_OFFSCREEN_DOT.backgroundColor,
                      boxShadow: GANTT_OFFSCREEN_DOT.boxShadow,
                    }}
                  />
                )}
              </div>
              {/* 里程碑：一列一個，節點疊在色條日格上 */}
              {displaySegs.map((seg, rowIdx) => {
                const rowTop = ROW_MONTH_H + ROW_DATE_H + ROW_PROJECT_H + rowIdx * ROW_MS_ROW_H;
                const bar = barLayoutInChart(seg.start, seg.end, dateToX, dayW, chartMinW);
                if (!bar) return null;
                const { left, width, rawLeft, roundLeft, roundRight } = bar;
                const barRadius = barBorderRadius(roundLeft, roundRight);
                const showDotL = barTouchesTimelineViewportLeft(rawLeft, scrollLeft, PINNED_LEFT_W);
                const showDotR = tw > 0 && rawLeft >= visT1;
                const bg = MILESTONE_COLORS[rowIdx % MILESTONE_COLORS.length];
                const detailNodes = Array.isArray(seg.detailNodes) ? seg.detailNodes : [];
                return (
                  <div
                    key={seg.id}
                    className="absolute left-0 right-0 border-b border-slate-200 bg-slate-50/30"
                    style={{ top: rowTop, height: ROW_MS_ROW_H }}
                  >
                    <div
                      aria-hidden
                      className={`absolute inset-y-0 pointer-events-none border-y border-slate-900/10 ${
                        seg.completed ? 'opacity-70' : ''
                      }`}
                      style={{
                        left,
                        width,
                        borderRadius: barRadius,
                        background: seg.completed ? '#86efac' : bg,
                        zIndex: 5,
                      }}
                    />
                    <div
                      aria-hidden
                      className="absolute flex items-center justify-center pointer-events-none z-[20] px-1"
                      style={{ left, width, top: 0, height: ROW_MS_ROW_H }}
                    >
                      <span className="text-[9px] font-bold text-slate-800 truncate max-w-full text-center leading-tight drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]">
                        {seg.label}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="平移項目"
                      title="拖曳色條頂端細線以平移"
                      className="absolute z-[25] cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 bg-white/50"
                      style={{ left, width, top: 0, height: 5 }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSegMouseDown(e, rowIdx, 'move');
                      }}
                    />
                    <div
                      className={`absolute inset-0 flex z-[50] ${readOnly ? 'pointer-events-none' : ''}`}
                    >
                      {layoutDays.map((d, i) => {
                        const ymdCell = fmtYmd(d);
                        const wknd = isWeekend(d);
                        const hol = !wknd && holidayYmdSet.has(ymdCell);
                        const holTitle = hol ? holidayTooltip(ymdCell, holidayByDate) : '';
                        const nodesOnDay = detailNodes.filter((n) => n.date === ymdCell);
                        const hasNode = nodesOnDay.length > 0;
                        const nodeMeta = hasNode ? nodeKindMeta(nodesOnDay[0].kind) : null;
                        return (
                          <button
                            key={`${seg.id}-cell-${i}`}
                            type="button"
                            title={
                              hasNode
                                ? `${ymdCell} ${nodeMeta.label}：${nodesOnDay[0].label}（點擊移除）`
                                : holTitle
                                  ? `${ymdCell} ${holTitle}`
                                  : `${ymdCell} 新增節點`
                            }
                            className={`relative shrink-0 border-r border-slate-300/80 p-0 min-h-0 ${
                              hasNode
                                ? 'hover:brightness-95 ring-1 ring-inset ring-white/40'
                                : 'bg-transparent hover:bg-indigo-100/50'
                            }`}
                            style={{
                              width: dayW,
                              minWidth: dayW,
                              height: ROW_MS_ROW_H,
                              backgroundColor: hasNode ? nodeMeta.color : undefined,
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasNode) {
                                const first = nodesOnDay[0];
                                if (
                                  typeof window !== 'undefined' &&
                                  !window.confirm(`移除「${first.label}」？`)
                                )
                                  return;
                                removeTimelineDetailNode(seg.id, first.id);
                                return;
                              }
                              openNodeCreateModal(seg.id, ymdCell);
                            }}
                          />
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      aria-label="調整開始"
                      className="absolute z-[55] top-0 bottom-0 w-2 cursor-ew-resize bg-white/60 opacity-0 hover:opacity-100"
                      style={{ left }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSegMouseDown(e, rowIdx, 'resize-left');
                      }}
                    />
                    <button
                      type="button"
                      aria-label="調整結束"
                      className="absolute z-[55] top-0 bottom-0 w-2 cursor-ew-resize bg-white/60 opacity-0 hover:opacity-100"
                      style={{ left: left + width - 8 }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSegMouseDown(e, rowIdx, 'resize-right');
                      }}
                    />
                    {showDotL && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute z-[15]"
                        style={{
                          left: 0,
                          top: ROW_MS_ROW_H / 2,
                          transform: 'translateY(-50%)',
                          width: GANTT_OFFSCREEN_DOT.width,
                          height: GANTT_OFFSCREEN_DOT.height,
                          borderRadius: GANTT_OFFSCREEN_DOT.borderRadius,
                          backgroundColor: GANTT_OFFSCREEN_DOT.backgroundColor,
                          boxShadow: GANTT_OFFSCREEN_DOT.boxShadow,
                        }}
                      />
                    )}
                    {showDotR && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute z-[15]"
                        style={{
                          left: visT1 - 6,
                          top: ROW_MS_ROW_H / 2,
                          transform: 'translate(-50%, -50%)',
                          width: GANTT_OFFSCREEN_DOT.width,
                          height: GANTT_OFFSCREEN_DOT.height,
                          borderRadius: GANTT_OFFSCREEN_DOT.borderRadius,
                          backgroundColor: GANTT_OFFSCREEN_DOT.backgroundColor,
                          boxShadow: GANTT_OFFSCREEN_DOT.boxShadow,
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {/* 今日線 */}
              {todayPx >= 0 && todayPx <= chartMinW && (
                <div
                  className="pointer-events-none absolute z-[20] bg-indigo-400/70"
                  style={{
                    left: todayPx,
                    top: 0,
                    width: 1.5,
                    height: chartBodyH,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {allDetailNodesFlat.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/80">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
            時程節點一覽（共 {allDetailNodesFlat.length}）
          </p>
          <ul className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {allDetailNodesFlat.map((n) => (
              <li key={`${n.segId}-${n.date}-${n.label}`}>
                <button
                  type="button"
                  disabled={readOnly}
                  className={`text-[10px] px-2 py-0.5 rounded-md border ${
                    activeSegId === n.segId
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-indigo-200 bg-white text-slate-700'
                  } ${readOnly ? '' : 'hover:bg-indigo-50'}`}
                  title={readOnly ? `${n.milestoneLabel}` : `${n.milestoneLabel} — 點選後在專案／項目列新增節點`}
                  onClick={() => !readOnly && setActiveSegId(n.segId)}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-sm mr-0.5 align-middle"
                    style={{ backgroundColor: nodeKindMeta(n.kind).color }}
                  />
                  <span className="text-indigo-600 tabular-nums">{n.date}</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="font-medium">{n.label}</span>
                  <span className="text-slate-400 ml-1">({n.milestoneLabel})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nodeCreateModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && !nodeCreateSaving && setNodeCreateModal(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/70 bg-white shadow-xl animate-slide-up"
            role="dialog"
            aria-modal="true"
            aria-labelledby="node-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
              <div>
                <h3 id="node-create-title" className="text-base font-semibold text-slate-900">
                  新增時程節點
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {(() => {
                    const row = milestones.find((m) => m.id === nodeCreateModal.milestoneId);
                    const d = parseISO(nodeCreateModal.dateYmd);
                    const dateLabel = isValid(d)
                      ? `${format(d, 'yyyy年M月d日')}（${WEEKDAYS_ZH[getDay(d)]}）`
                      : nodeCreateModal.dateYmd;
                    return (
                      <>
                        <span className="font-medium text-slate-700">{row?.label || '項目'}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="tabular-nums">{dateLabel}</span>
                      </>
                    );
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !nodeCreateSaving && setNodeCreateModal(null)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">節點類型</p>
                <div className="grid grid-cols-2 gap-2">
                  {NODE_KINDS.map((k) => {
                    const selected = nodeCreateModal.kind === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setNodeCreateModal((m) => (m ? { ...m, kind: k.id } : m))}
                        className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50/80 shadow-sm ring-1 ring-indigo-200'
                            : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-sm shrink-0 border border-black/10"
                          style={{ backgroundColor: k.color }}
                        />
                        <span className={`font-medium ${selected ? 'text-indigo-900' : 'text-slate-700'}`}>
                          {k.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="node-create-label" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  節點說明 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="node-create-label"
                  type="text"
                  autoFocus
                  value={nodeCreateModal.label}
                  onChange={(e) =>
                    setNodeCreateModal((m) => (m ? { ...m, label: e.target.value } : m))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !nodeCreateSaving && nodeCreateModal.label.trim()) {
                      e.preventDefault();
                      void submitNodeCreate();
                    }
                  }}
                  placeholder="例如：客戶確認版、內部審查通過…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
              <button
                type="button"
                disabled={nodeCreateSaving || !nodeCreateModal.label.trim()}
                onClick={() => void submitNodeCreate()}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {nodeCreateSaving ? '儲存中…' : '建立節點'}
              </button>
              <button
                type="button"
                disabled={nodeCreateSaving}
                onClick={() => setNodeCreateModal(null)}
                className="px-4 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
