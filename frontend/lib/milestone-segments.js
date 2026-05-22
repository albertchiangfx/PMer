import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns';
import { parseTimelineDetailNodes } from './timeline-detail-nodes';

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
    if (rem > 0) rem -= 1;
    const s = cur;
    const e = addDays(s, len - 1);
    out.push({ start: s, end: e });
    cur = addDays(e, 1);
  }
  if (out.length) out[out.length - 1].end = pEnd;
  return out;
}

/** 與 ProjectMilestoneTimeline 相同的項目區間推算 */
export function buildMilestoneSegments(project, milestones) {
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
