import {
  addDays,
  eachDayOfInterval,
  format,
  getDay,
  isValid,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { fmtCurrency } from './utils';
import { NODE_KINDS, nodeKindMeta } from './timeline-detail-nodes';
import {
  countWorkingDaysInclusive,
  loadEnabledHolidayCountries,
  loadHolidayIndex,
} from './public-holidays';

const LABEL_COL_W = 168;
const MS_ROW_H = 26;
const MIN_EXPORT_DAY_W = 12;
const MIN_EXPORT_WEEK_W = 24;
/** 超過此天數改為「每週一欄」 */
const EXPORT_WEEK_THRESHOLD = 70;
/** A4 橫向可印內容寬（297mm − 12mm×2 邊界）@ 96dpi — 客戶版時間軸固定滿此寬 */
const A4_LANDSCAPE_CONTENT_PX = Math.round((273 * 96) / 25.4);
/** A4 橫向安全可印高度（預留瀏覽器頁首/頁尾與邊界）@ 96dpi */
const A4_LANDSCAPE_SAFE_H_PX = Math.round((172 * 96) / 25.4);
const PRINT_ZOOM_MIN = 0.72;

/** 估算匯出頁總高度（px），供單頁 PDF 縮放 */
function estimateExportHeight({ segCount, nodeCount, briefLen, hasChart }) {
  const briefLines = briefLen > 0 ? Math.max(1, Math.ceil(briefLen / 52)) : 0;
  const metaH = 48 + briefLines * 14;
  const titleH = 32;
  const legendH = 28;
  const ganttH = hasChart ? 20 + 28 + 26 + Math.max(0, segCount) * MS_ROW_H : 20;
  const tableRowH = 21;
  const leftTableH = segCount > 0 ? 22 + (segCount + 1) * tableRowH : 18;
  const rightTableH = nodeCount > 0 ? 22 + (nodeCount + 1) * tableRowH : 18;
  const notesH = 14 + Math.max(leftTableH, rightTableH);
  const footerH = 12;
  const gaps = 24;
  return titleH + metaH + legendH + ganttH + notesH + footerH + gaps;
}

function computePrintZoom(estimatedH) {
  if (estimatedH <= A4_LANDSCAPE_SAFE_H_PX) return 1;
  const zoom = A4_LANDSCAPE_SAFE_H_PX / estimatedH;
  return Math.max(PRINT_ZOOM_MIN, Math.min(1, zoom));
}

function computeExportLayout(unitCount, minUnitW = MIN_EXPORT_DAY_W) {
  const chartW = A4_LANDSCAPE_CONTENT_PX;
  if (unitCount <= 0) return { unitW: minUnitW, chartW };
  const budget = chartW - LABEL_COL_W;
  const unitW = Math.max(minUnitW, Math.floor(budget / unitCount));
  return { unitW, chartW };
}

function gridCols(n) {
  return `${LABEL_COL_W}px repeat(${n}, minmax(0, 1fr))`;
}

/** 客戶版：僅專案起訖日（不含畫面甘特的前後數月留白） */
function buildExportDays(project) {
  const pStart = toDate(project?.start_date);
  const pEnd = toDate(project?.end_date);
  if (!pStart || !pEnd || pEnd < pStart) return [];
  return eachDayOfInterval({ start: pStart, end: pEnd });
}

/** 專案很長時改週欄，橫軸仍對齊專案總長 */
function buildExportWeeks(pStart, pEnd) {
  if (!pStart || !pEnd || pEnd < pStart) return [];
  const weeks = [];
  let cur = startOfWeek(pStart, { weekStartsOn: 1 });
  while (cur <= pEnd) {
    const rangeStart = cur < pStart ? pStart : cur;
    const weekEnd = addDays(cur, 6);
    const rangeEnd = weekEnd > pEnd ? pEnd : weekEnd;
    weeks.push({ weekStart: cur, rangeStart, rangeEnd });
    cur = addDays(cur, 7);
  }
  return weeks;
}

function clampRangeIdx(units, rangeStart, rangeEnd, overlapFn) {
  let startIdx = 0;
  let endIdx = units.length - 1;
  for (let i = 0; i < units.length; i++) {
    if (overlapFn(units[i], rangeStart, rangeEnd)) {
      startIdx = i;
      break;
    }
  }
  for (let i = units.length - 1; i >= 0; i--) {
    if (overlapFn(units[i], rangeStart, rangeEnd)) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < startIdx) endIdx = startIdx;
  return { startIdx, endIdx };
}

function dayOverlapsRange(day, rs, re) {
  const d = ymd(day);
  return d >= ymd(rs) && d <= ymd(re);
}

function weekOverlapsRange(week, rs, re) {
  return ymd(week.rangeEnd) >= ymd(rs) && ymd(week.rangeStart) <= ymd(re);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ymd(d) {
  if (!d) return '';
  if (d instanceof Date && isValid(d)) return format(d, 'yyyy-MM-dd');
  return String(d).slice(0, 10);
}

function toDate(d) {
  if (d instanceof Date && isValid(d)) return d;
  const p = parseISO(ymd(d));
  return isValid(p) ? p : null;
}

function safeFilename(name) {
  return (
    String(name || 'timeline')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'timeline'
  );
}

const MILESTONE_COLORS = [
  '#c7d2fe',
  '#bae6fd',
  '#a7f3d0',
  '#fde68a',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
];

function gridCol(i) {
  return i + 2;
}

/** 每個日期對應的月份帶狀索引（交替亮暗） */
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

function buildMonthCells(days, row) {
  if (!days.length) return '';
  const parts = [];
  let i = 0;
  let monthIdx = 0;
  while (i < days.length) {
    const key = format(days[i], 'yyyy-MM');
    let j = i + 1;
    while (j < days.length && format(days[j], 'yyyy-MM') === key) j++;
    const span = j - i;
    const alt = monthIdx % 2 === 0 ? 'month-alt-a' : 'month-alt-b';
    parts.push(
      `<div class="month-cell ${alt}" style="grid-row:${row};grid-column:${gridCol(i)}/span ${span}">${format(days[i], 'yyyy年M月')}</div>`
    );
    i = j;
    monthIdx += 1;
  }
  return parts.join('');
}

function dayTintClass(d, holidayYmdSet) {
  const wknd = getDay(d) === 0 || getDay(d) === 6;
  const key = ymd(d);
  if (!wknd && holidayYmdSet?.has?.(key)) return ' holiday';
  if (wknd) return ' weekend';
  return '';
}

function buildDateHeaderCells(days, monthBands, row, holidayYmdSet) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return days
    .map((d, i) => {
      const band = monthBands[i] || 'month-band-a';
      return `<div class="day-cell head-cell ${band}${dayTintClass(d, holidayYmdSet)}" style="grid-row:${row};grid-column:${gridCol(i)}">
        <span class="head-d">${format(d, 'd')}</span>
        <span class="head-w">${weekdays[getDay(d)]}</span>
      </div>`;
    })
    .join('');
}

function buildTimelineCells(days, monthBands, row, holidayYmdSet) {
  return days
    .map((d, i) => {
      const band = monthBands[i] || 'month-band-a';
      return `<div class="timeline-cell ${band}${dayTintClass(d, holidayYmdSet)}" style="grid-row:${row};grid-column:${gridCol(i)}"></div>`;
    })
    .join('');
}

/** 節點標記畫在進度條之上（DOM 與 z-index 皆在 bar 之後） */
function buildNodeMarkerCells(days, row, detailNodes) {
  if (!detailNodes?.length) return '';
  const byDate = {};
  for (const node of detailNodes) {
    if (node?.date) byDate[node.date] = node;
  }
  return days
    .map((d, i) => {
      const key = ymd(d);
      const node = byDate[key];
      if (!node) return '';
      const meta = nodeKindMeta(node.kind);
      return `<div class="node-marker" style="grid-row:${row};grid-column:${gridCol(i)};background:${meta.color}" title="${esc(node.label)}"></div>`;
    })
    .join('');
}

function buildChartBar(row, startIdx, endIdx, className, innerHtml, extraStyle = '') {
  const span = Math.max(1, endIdx - startIdx + 1);
  return `<div class="chart-bar ${className}" style="grid-row:${row};grid-column:${gridCol(startIdx)}/span ${span};${extraStyle}">${innerHtml}</div>`;
}

function buildNodeLegendHtml() {
  const items = NODE_KINDS.map(
    (k) =>
      `<li><span class="legend-swatch" style="background:${k.color}"></span>${esc(k.label)}</li>`
  ).join('');
  return `<div class="node-legend"><span class="label-gutter" aria-hidden="true"></span><div class="node-legend-body"><span class="node-legend-title">節點圖例</span><ul>${items}</ul></div></div>`;
}

function clampSegIdx(days, start, end) {
  return clampRangeIdx(days, start, end, (d, rs, re) => dayOverlapsRange(d, rs, re));
}

function buildWeekMonthBands(weeks) {
  const bands = [];
  let band = 0;
  let prev = null;
  for (const w of weeks) {
    const k = format(w.weekStart, 'yyyy-MM');
    if (prev !== null && k !== prev) band += 1;
    bands.push(band % 2 === 0 ? 'month-band-a' : 'month-band-b');
    prev = k;
  }
  return bands;
}

function buildDailyChart(days, projName, segs, pStart, pEnd, holidayYmdSet) {
  const monthBands = buildMonthBands(days);
  const cols = gridCols(days.length);
  const parts = [];
  let row = 1;

  parts.push(`<span class="row-label" style="grid-row:${row};grid-column:1">月份</span>`);
  parts.push(buildMonthCells(days, row));
  row++;

  parts.push(`<span class="row-label row-label--static" style="grid-row:${row};grid-column:1">日期</span>`);
  parts.push(buildDateHeaderCells(days, monthBands, row, holidayYmdSet));
  row++;

  const { startIdx: pSi, endIdx: pEi } = clampSegIdx(days, pStart, pEnd);
  const projWd = countWorkingDaysInclusive(pStart, pEnd, holidayYmdSet);
  parts.push(
    `<span class="row-label" style="grid-row:${row};grid-column:1">專案<span class="wd-tag"> · ${projWd}工作天</span></span>`
  );
  parts.push(buildTimelineCells(days, monthBands, row, holidayYmdSet));
  parts.push(
    buildChartBar(row, pSi, pEi, 'chart-bar--proj', `<span>${esc(projName)}</span>`)
  );
  row++;

  segs.forEach((s, i) => {
    const { startIdx, endIdx } = clampSegIdx(days, s.start, s.end);
    const bg = MILESTONE_COLORS[i % MILESTONE_COLORS.length];
    const wd = countWorkingDaysInclusive(s.start, s.end, holidayYmdSet);
    parts.push(
      `<span class="row-label ms-label" style="grid-row:${row};grid-column:1">${esc(s.label)}<span class="wd-tag"> · ${wd}工作天</span></span>`
    );
    parts.push(buildTimelineCells(days, monthBands, row, holidayYmdSet));
    parts.push(
      buildChartBar(
        row,
        startIdx,
        endIdx,
        'chart-bar--ms',
        `<span class="ms-bar-label">${esc(s.label)}</span>`,
        `background:${bg}`
      )
    );
    parts.push(buildNodeMarkerCells(days, row, s.detailNodes));
    row++;
  });

  return `<div class="chart-grid" style="grid-template-columns:${cols}">${parts.join('')}</div>`;
}

function buildWeekMonthCells(weeks, row) {
  if (!weeks.length) return '';
  const parts = [];
  let i = 0;
  let monthIdx = 0;
  while (i < weeks.length) {
    const key = format(weeks[i].weekStart, 'yyyy-MM');
    let j = i + 1;
    while (j < weeks.length && format(weeks[j].weekStart, 'yyyy-MM') === key) j++;
    const span = j - i;
    const alt = monthIdx % 2 === 0 ? 'month-alt-a' : 'month-alt-b';
    parts.push(
      `<div class="month-cell ${alt}" style="grid-row:${row};grid-column:${gridCol(i)}/span ${span}">${format(weeks[i].weekStart, 'yyyy年M月')}</div>`
    );
    i = j;
    monthIdx += 1;
  }
  return parts.join('');
}

function weekTintClass(w, holidayYmdSet) {
  if (!holidayYmdSet?.size) return '';
  const days = eachDayOfInterval({ start: w.rangeStart, end: w.rangeEnd });
  return days.some((d) => holidayYmdSet.has(ymd(d))) ? ' holiday' : '';
}

function buildWeekHeaderCells(weeks, monthBands, row, holidayYmdSet) {
  return weeks
    .map((w, i) => {
      const band = monthBands[i] || 'month-band-a';
      const label =
        ymd(w.rangeStart) === ymd(w.rangeEnd)
          ? format(w.rangeStart, 'M/d')
          : `${format(w.rangeStart, 'M/d')}–${format(w.rangeEnd, 'd')}`;
      return `<div class="day-cell head-cell ${band}${weekTintClass(w, holidayYmdSet)}" style="grid-row:${row};grid-column:${gridCol(i)}">
        <span class="head-d">${label}</span>
        <span class="head-w">週</span>
      </div>`;
    })
    .join('');
}

function buildWeekTimelineCells(weeks, monthBands, row, holidayYmdSet) {
  return weeks
    .map((w, i) => {
      const band = monthBands[i] || 'month-band-a';
      return `<div class="timeline-cell ${band}${weekTintClass(w, holidayYmdSet)}" style="grid-row:${row};grid-column:${gridCol(i)}"></div>`;
    })
    .join('');
}

function buildWeekNodeMarkerCells(weeks, row, detailNodes) {
  if (!detailNodes?.length) return '';
  const nodes = detailNodes;
  return weeks
    .map((w, i) => {
      const node = nodes.find(
        (nd) => nd?.date && nd.date >= ymd(w.rangeStart) && nd.date <= ymd(w.rangeEnd)
      );
      if (!node) return '';
      const meta = nodeKindMeta(node.kind);
      return `<div class="node-marker" style="grid-row:${row};grid-column:${gridCol(i)};background:${meta.color}" title="${esc(node.label)}"></div>`;
    })
    .join('');
}

function buildWeeklyChart(weeks, projName, segs, pStart, pEnd, holidayYmdSet) {
  const monthBands = buildWeekMonthBands(weeks);
  const cols = gridCols(weeks.length);
  const parts = [];
  let row = 1;

  parts.push(`<span class="row-label" style="grid-row:${row};grid-column:1">月份</span>`);
  parts.push(buildWeekMonthCells(weeks, row));
  row++;

  parts.push(`<span class="row-label row-label--static" style="grid-row:${row};grid-column:1">週次</span>`);
  parts.push(buildWeekHeaderCells(weeks, monthBands, row, holidayYmdSet));
  row++;

  const { startIdx: pSi, endIdx: pEi } = clampRangeIdx(weeks, pStart, pEnd, weekOverlapsRange);
  const projWd = countWorkingDaysInclusive(pStart, pEnd, holidayYmdSet);
  parts.push(
    `<span class="row-label" style="grid-row:${row};grid-column:1">專案<span class="wd-tag"> · ${projWd}工作天</span></span>`
  );
  parts.push(buildWeekTimelineCells(weeks, monthBands, row, holidayYmdSet));
  parts.push(
    buildChartBar(row, pSi, pEi, 'chart-bar--proj', `<span>${esc(projName)}</span>`)
  );
  row++;

  segs.forEach((s, i) => {
    const { startIdx, endIdx } = clampRangeIdx(weeks, s.start, s.end, weekOverlapsRange);
    const bg = MILESTONE_COLORS[i % MILESTONE_COLORS.length];
    const wd = countWorkingDaysInclusive(s.start, s.end, holidayYmdSet);
    parts.push(
      `<span class="row-label ms-label" style="grid-row:${row};grid-column:1">${esc(s.label)}<span class="wd-tag"> · ${wd}工作天</span></span>`
    );
    parts.push(buildWeekTimelineCells(weeks, monthBands, row, holidayYmdSet));
    parts.push(
      buildChartBar(
        row,
        startIdx,
        endIdx,
        'chart-bar--ms',
        `<span class="ms-bar-label">${esc(s.label)}</span>`,
        `background:${bg}`
      )
    );
    parts.push(buildWeekNodeMarkerCells(weeks, row, s.detailNodes));
    row++;
  });

  return `<div class="chart-grid" style="grid-template-columns:${cols}">${parts.join('')}</div>`;
}

/**
 * @param {{ name?, client_name?, start_date?, end_date?, budget?, description? }} project
 * @param {Array<{ label, start, end, detailNodes? }>} segments
 */
export function buildClientTimelineHtml(project, segments, options = {}) {
  const holidayYmdSet =
    options.holidayYmdSet instanceof Set ? options.holidayYmdSet : new Set();
  const projName = project?.name || '專案';
  const client = project?.client_name || '—';
  const pStart = project?.start_date;
  const pEnd = project?.end_date;
  const budget =
    project?.budget != null && project?.budget !== '' ? fmtCurrency(project.budget) : '—';
  const period =
    pStart && pEnd ? `${ymd(pStart)} — ${ymd(pEnd)}` : '尚未設定專案起訖';
  const description = String(project?.description || '').trim();
  const briefHtml = description
    ? esc(description).replace(/\n/g, '<br>')
    : '<span class="muted">（無簡述）</span>';

  const segs = (segments || []).map((s) => ({
    label: s.label || '項目',
    start: toDate(s.start) ?? s.start,
    end: toDate(s.end) ?? s.end,
    detailNodes: Array.isArray(s.detailNodes) ? s.detailNodes : [],
  }));

  const allNodes = [];
  for (const s of segs) {
    for (const n of s.detailNodes) {
      if (n?.date && n?.label) {
        allNodes.push({
          date: n.date,
          label: n.label,
          kind: n.kind,
          milestoneLabel: s.label,
        });
      }
    }
  }
  allNodes.sort((a, b) => {
    const da = String(a.date || '');
    const db = String(b.date || '');
    return da.localeCompare(db) || String(a.milestoneLabel).localeCompare(String(b.milestoneLabel));
  });

  const pStartD = toDate(pStart);
  const pEndD = toDate(pEnd);
  const exportDays = buildExportDays(project);
  const useWeeks = exportDays.length > EXPORT_WEEK_THRESHOLD;
  const weeks = useWeeks && pStartD && pEndD ? buildExportWeeks(pStartD, pEndD) : [];
  const unitCount = useWeeks ? weeks.length : exportDays.length;
  const minUnit = useWeeks ? MIN_EXPORT_WEEK_W : MIN_EXPORT_DAY_W;
  const { unitW, chartW } = computeExportLayout(unitCount, minUnit);
  const headDFont = unitW >= 18 ? '0.8rem' : unitW >= 12 ? '0.68rem' : '0.58rem';
  const headWFont = unitW >= 18 ? '0.62rem' : '0.52rem';
  const headCellH = 30;
  const nodeLegendHtml = buildNodeLegendHtml();
  const estHeight = estimateExportHeight({
    segCount: segs.length,
    nodeCount: allNodes.length,
    briefLen: description.length,
    hasChart: unitCount > 0,
  });
  const printZoom = computePrintZoom(estHeight);
  const printZoomCss = printZoom >= 0.999 ? '1' : printZoom.toFixed(3);

  const chartHtml =
    unitCount > 0
      ? useWeeks
        ? buildWeeklyChart(weeks, projName, segs, pStart, pEnd, holidayYmdSet)
        : buildDailyChart(exportDays, projName, segs, pStart, pEnd, holidayYmdSet)
      : '';

  const timelineBlock =
    chartHtml
      ? `<div class="timeline-wrap">
          <div class="timeline-inner">${chartHtml}</div>
        </div>`
      : '<p class="muted pad">請先在專案資料設定開始／結束日期，才能產生時間軸圖。</p>';

  const milestoneTable = segs.length
    ? `<table class="align-table">
        <thead><tr><th>項目</th><th>工作天</th><th>開始</th><th>結束</th></tr></thead>
        <tbody>
          ${segs
            .map((s) => {
              const wd = countWorkingDaysInclusive(s.start, s.end, holidayYmdSet);
              return `<tr><td>${esc(s.label)}</td><td class="col-wd">${wd}</td><td class="col-date">${esc(ymd(s.start) || '—')}</td><td class="col-date">${esc(ymd(s.end) || '—')}</td></tr>`;
            })
            .join('')}
        </tbody>
      </table>`
    : '<p class="muted">尚無項目。</p>';

  const nodeTable = allNodes.length
    ? `<table class="align-table">
        <thead><tr><th>日期</th><th>項目</th><th>節點</th></tr></thead>
        <tbody>
          ${allNodes
            .map(
              (n) =>
                `<tr><td class="col-date">${esc(n.date)}</td><td>${esc(n.milestoneLabel)}</td><td>${esc(n.label)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>`
    : '<p class="muted">尚無時程節點。</p>';

  const downloadName = `${safeFilename(project?.name)}_客戶時間軸_${format(new Date(), 'yyyyMMdd')}.html`;

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(projName)} — 專案時間軸</title>
  <style>
    /* 單頁 A4 橫向（297×210mm） */
    @page { size: A4 landscape; margin: 5mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif;
      color: #0f172a;
      background: #e2e8f0;
      margin: 0;
      padding: 56px 16px 24px;
      line-height: 1.45;
    }
    .toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background: #0f172a;
      color: #fff;
      padding: 10px 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      font-size: 0.85rem;
      box-shadow: 0 2px 12px rgba(15, 23, 42, 0.2);
    }
    .page-sheet {
      width: ${chartW}px;
      max-width: 100%;
      margin: 0 auto 24px;
      padding: 8mm;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(15, 23, 42, 0.1);
      overflow-x: auto;
    }
    .page-sheet > .doc-title,
    .page-sheet > .meta-row,
    .page-sheet > .node-legend,
    .page-sheet > .timeline-wrap,
    .page-sheet > .notes-panel,
    .page-sheet > .footer {
      width: 100%;
    }
    .notes-panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 20px;
      align-items: start;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
    }
    .notes-block h3 {
      width: ${LABEL_COL_W}px;
      max-width: 100%;
      padding: 0 10px;
      box-sizing: border-box;
      font-size: 0.75rem;
      margin: 0 0 6px;
      color: #475569;
      font-weight: 700;
      text-align: left;
    }
    @media (max-width: 800px) {
      .notes-panel { grid-template-columns: 1fr; }
    }
    .meta-row .label-gutter {
      background: #f8fafc;
      border-right: 2px solid #94a3b8;
      padding: 0;
    }
    .align-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.72rem;
      table-layout: fixed;
    }
    .align-table th {
      text-align: left;
      padding: 5px 10px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #64748b;
      font-weight: 700;
      font-size: 0.72rem;
    }
    .align-table td {
      padding: 5px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #0f172a;
    }
    .align-table th:first-child,
    .align-table td:first-child {
      width: ${LABEL_COL_W}px;
      padding-left: 10px;
    }
    .align-table tbody tr:nth-child(even) td { background: #fafbfc; }
    .align-table .col-date {
      font-variant-numeric: tabular-nums;
      color: #0f172a;
      font-weight: 500;
      white-space: nowrap;
    }
    .toolbar button {
      background: #fff;
      color: #0f172a;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .doc-title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 10px;
      margin: 0 0 10px;
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .doc-title .brand {
      color: #4f46e5;
      letter-spacing: 0.02em;
    }
    .doc-title .sep {
      color: #cbd5e1;
      font-weight: 400;
    }
    .doc-title .project-name { color: #0f172a; }
    .doc-title .client-name {
      color: #475569;
      font-size: 1.05rem;
      font-weight: 600;
    }
    .meta-row {
      display: grid;
      grid-template-columns: ${LABEL_COL_W}px 1fr 1fr 1.4fr;
      gap: 0;
      padding: 0;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 0.82rem;
      overflow: hidden;
    }
    .meta-row > div {
      padding: 10px 12px;
      border-right: 1px solid #e2e8f0;
    }
    .meta-row > div:last-child { border-right: none; }
    .meta-row dt { color: #64748b; font-size: 0.72rem; margin: 0 0 4px; font-weight: 600; }
    .meta-row dd { margin: 0; font-weight: 600; color: #0f172a; line-height: 1.4; }
    .meta-brief dd { font-weight: 500; font-size: 0.84rem; }
    @media (max-width: 720px) {
      .meta-row { grid-template-columns: 1fr; }
    }
    .timeline-wrap {
      overflow: hidden;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      padding: 0;
      width: 100%;
      margin: 0;
    }
    .timeline-inner {
      display: block;
      width: 100%;
    }
    .chart-grid {
      display: grid;
      width: 100%;
      border: none;
      background: #fff;
      overflow: hidden;
    }
    .row-label {
      grid-column: 1;
      font-size: 0.75rem;
      font-weight: 700;
      color: #64748b;
      padding: 0 10px;
      text-align: left;
      background: #f8fafc;
      border-right: 2px solid #94a3b8;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      box-sizing: border-box;
    }
    .row-label.ms-label {
      justify-content: flex-start;
      text-align: left;
    }
    .timeline-cell,
    .day-cell {
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #e2e8f0;
      box-sizing: border-box;
      min-width: 0;
      position: relative;
    }
    .timeline-cell {
      min-height: ${MS_ROW_H}px;
      background-color: #fafbfc;
    }
    .timeline-cell.month-band-a:not(.weekend) { background-color: #fafbfc; }
    .timeline-cell.month-band-b:not(.weekend) { background-color: #f1f5f9; }
    .row-label--static {
      pointer-events: none;
    }
    .label-gutter {
      width: ${LABEL_COL_W}px;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .node-legend {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 0;
      margin-bottom: 6px;
      padding: 0;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.65rem;
      color: #475569;
      overflow: hidden;
    }
    .node-legend-body {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 8px 12px;
      padding: 6px 10px;
      flex: 1;
      min-width: 0;
    }
    .node-legend-title {
      font-weight: 700;
      color: #64748b;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .node-legend ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 8px 12px;
    }
    .node-legend li {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .legend-swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      flex-shrink: 0;
    }
    .row-label.ms-label {
      min-height: ${MS_ROW_H}px;
    }
    .head-cell.weekend,
    .timeline-cell.weekend {
      background-color: #fff5f5 !important;
    }
    .head-cell.holiday,
    .timeline-cell.holiday {
      background-color: rgba(251, 191, 36, 0.16) !important;
    }
    .wd-tag {
      font-size: 0.68rem;
      font-weight: 500;
      color: #64748b;
      white-space: nowrap;
    }
    .align-table .col-wd {
      font-variant-numeric: tabular-nums;
      text-align: right;
      width: 3.5rem;
    }
    .month-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 2px 8px;
      font-size: 0.7rem;
      font-weight: 700;
      color: #475569;
      text-align: center;
      white-space: nowrap;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      box-sizing: border-box;
    }
    .month-alt-a { background: #dce3ed; }
    .month-alt-b { background: #c5d0de; }
    .head-cell.month-band-a:not(.weekend) { background: #f8fafc; }
    .head-cell.month-band-b:not(.weekend) { background: #eef2f7; }
    .head-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1px 0;
      min-height: ${headCellH}px;
    }
    .head-d { font-size: ${headDFont}; font-weight: 700; color: #334155; line-height: 1; }
    .head-w { font-size: ${headWFont}; color: #94a3b8; line-height: 1; }
    .chart-bar {
      z-index: 1;
      display: flex;
      align-items: center;
      align-self: center;
      margin: 3px 1px;
      min-height: ${MS_ROW_H - 6}px;
      max-width: calc(100% - 2px);
      border-radius: 4px;
      box-sizing: border-box;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .chart-bar--proj {
      background: linear-gradient(90deg, #4f46e5, #6366f1);
      color: #fff;
      font-size: 0.82rem;
      font-weight: 700;
      padding: 0 10px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .chart-bar--ms {
      justify-content: center;
      border: 1px solid rgba(15, 23, 42, 0.1);
      padding: 0 8px;
    }
    .node-marker {
      z-index: 10;
      align-self: center;
      justify-self: center;
      width: 10px;
      max-width: calc(100% - 4px);
      margin: 3px 0;
      min-height: ${MS_ROW_H - 6}px;
      border-radius: 2px;
      box-sizing: border-box;
      border: 1px solid rgba(15, 23, 42, 0.2);
      pointer-events: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ms-bar-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 8px;
      text-align: center;
      max-width: 100%;
    }
    .muted { color: #94a3b8; }
    .pad { padding: 12px 0; }
    .footer {
      margin-top: 8px;
      font-size: 0.68rem;
      color: #94a3b8;
      text-align: right;
    }
    @media print {
      html, body {
        width: 100%;
        height: auto;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .toolbar { display: none !important; }
      .page-sheet {
        width: ${chartW}px !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        padding: 2mm !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
        page-break-inside: avoid;
        break-inside: avoid-page;
        zoom: ${printZoomCss};
      }
      .doc-title { font-size: 1rem; margin-bottom: 6px; }
      .meta-row { margin-bottom: 6px; font-size: 0.76rem; }
      .meta-row > div { padding: 6px 8px; }
      .meta-row dt { margin-bottom: 2px; }
      .node-legend { margin-bottom: 4px; }
      .node-legend-body { padding: 4px 8px; }
      .notes-panel {
        margin-top: 6px;
        padding-top: 6px;
        gap: 8px 12px;
        page-break-inside: auto;
        break-inside: auto;
      }
      .notes-block h3 { margin-bottom: 4px; font-size: 0.7rem; }
      .align-table { font-size: 0.65rem; }
      .align-table th,
      .align-table td { padding: 3px 8px; }
      .footer { margin-top: 4px; }
      .timeline-wrap {
        overflow: hidden !important;
        border: none;
        padding: 0;
        width: 100%;
        max-width: none;
        margin: 0;
        page-break-inside: auto;
        break-inside: auto;
      }
      .timeline-inner,
      .chart-grid { width: 100% !important; }
      .month-cell { min-height: 18px; padding: 1px 4px; }
      .head-cell { min-height: 22px; }
      .timeline-cell,
      .row-label.ms-label { min-height: 20px; }
      .chart-bar,
      .node-marker { min-height: 14px; margin: 2px 1px; }
      .month-cell, .chart-bar, .head-cell, .timeline-cell, .node-marker {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .chart-bar--proj {
        background: #4f46e5 !important;
        background-image: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>單頁 A4<strong>橫向</strong>：版面<strong>橫向</strong>、<strong>取消頁首及頁尾</strong>、勾選<strong>背景圖形</strong>${printZoom < 0.999 ? `（內容較多，已自動縮放 ${Math.round(printZoom * 100)}%）` : ''}</span>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button type="button" onclick="window.print()">列印 / 另存 PDF</button>
      <button type="button" onclick="saveExportHtml()">下載 HTML</button>
    </div>
  </div>

  <section class="page-sheet" aria-label="客戶時間軸">
    <div class="doc-title">
      <span class="brand">multi.design</span>
      <span class="sep">·</span>
      <span class="project-name">${esc(projName)}</span>
      <span class="sep">·</span>
      <span class="client-name">${esc(client)}</span>
    </div>
    <dl class="meta-row">
      <div class="label-gutter" aria-hidden="true"></div>
      <div><dt>專案時程</dt><dd>${esc(period)}</dd></div>
      <div><dt>預算</dt><dd>${esc(budget)}</dd></div>
      <div class="meta-brief"><dt>專案製作物簡述</dt><dd>${briefHtml}</dd></div>
    </dl>
    ${nodeLegendHtml}
    ${timelineBlock}
    <div class="notes-panel">
      <div class="notes-block">
        <h3>項目</h3>
        ${milestoneTable}
      </div>
      <div class="notes-block">
        <h3>時程節點</h3>
        ${nodeTable}
      </div>
    </div>
    <p class="footer">multi.design</p>
  </section>
  <script>
  function saveExportHtml() {
    var a = document.createElement('a');
    a.href = window.location.href;
    a.download = ${JSON.stringify(downloadName)};
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  </script>
</body>
</html>`;

  return html;
}

/**
 * 開啟預覽視窗（不自動下載）。預覽頁內可再按「下載 HTML」或「列印」。
 */
export async function exportClientTimeline(project, segments) {
  try {
    const exportDays = buildExportDays(project);
    let holidayYmdSet = new Set();
    if (exportDays.length > 0) {
      try {
        const idx = await loadHolidayIndex(
          exportDays[0],
          exportDays[exportDays.length - 1],
          loadEnabledHolidayCountries(project?.id)
        );
        holidayYmdSet = idx.dateSet;
      } catch (err) {
        console.warn('export holidays', err);
      }
    }
    const html = buildClientTimelineHtml(project, segments, { holidayYmdSet });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const w = window.open(url, '_blank', 'width=1280,height=800,scrollbars=yes');
    if (!w) {
      URL.revokeObjectURL(url);
      return { ok: false, message: '請允許彈出視窗後再按一次「匯出客戶時間軸」。' };
    }
    w.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 300_000);
    return { ok: true };
  } catch (err) {
    console.error('exportClientTimeline', err);
    return { ok: false, message: err?.message || '匯出失敗，請稍後再試。' };
  }
}
