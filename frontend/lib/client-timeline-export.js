import { eachDayOfInterval, format, parseISO, isValid, getDay } from 'date-fns';
import { fmtCurrency } from './utils';
import { NODE_KINDS, nodeKindMeta } from './timeline-detail-nodes';

const DAY_W = 30;
const LABEL_COL_W = 156;
const MS_ROW_H = 28;

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

function ymdZh(d) {
  const s = ymd(d);
  if (!s) return '—';
  const p = parseISO(s);
  return isValid(p) ? format(p, 'yyyy年M月d日') : s;
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

function exportGridLineCss(dayW) {
  const lineAt = Math.max(0, dayW - 1);
  return `repeating-linear-gradient(to right, transparent 0, transparent ${lineAt}px, #cbd5e1 ${lineAt}px, #cbd5e1 ${dayW}px)`;
}

function buildDays(rangeStart, rangeEnd) {
  const rs = toDate(rangeStart);
  const re = toDate(rangeEnd);
  if (!rs || !re || re < rs) return [];
  return eachDayOfInterval({ start: rs, end: re });
}

function dayIndex(days, dateVal) {
  return days.findIndex((d) => ymd(d) === ymd(dateVal));
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

function buildMonthCells(days) {
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
      `<div class="month-cell ${alt}" style="grid-column: span ${span}">${format(days[i], 'yyyy年M月')}</div>`
    );
    i = j;
    monthIdx += 1;
  }
  return parts.join('');
}

function buildDateHeaderCells(days, monthBands) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return days
    .map((d, i) => {
      const wknd = getDay(d) === 0 || getDay(d) === 6;
      const band = monthBands[i] || 'month-band-a';
      return `<div class="day-cell head-cell ${band}${wknd ? ' weekend' : ''}">
        <span class="head-d">${format(d, 'd')}</span>
        <span class="head-w">${weekdays[getDay(d)]}</span>
      </div>`;
    })
    .join('');
}

function buildNodeLegendHtml() {
  const items = NODE_KINDS.map(
    (k) =>
      `<li><span class="legend-swatch" style="background:${k.color}"></span>${esc(k.label)}</li>`
  ).join('');
  return `<div class="node-legend"><span class="node-legend-title">節點圖例</span><ul>${items}</ul></div>`;
}

function clampSegIdx(days, start, end) {
  const n = days.length;
  let startIdx = dayIndex(days, start);
  let endIdx = dayIndex(days, end);
  if (startIdx < 0) startIdx = 0;
  if (endIdx < 0) endIdx = n - 1;
  if (endIdx < startIdx) endIdx = startIdx;
  return { startIdx, endIdx };
}

/** 專案列：色條對齊專案起訖 */
function buildProjLane(days, projName, pStart, pEnd, monthBands) {
  const n = days.length;
  const trackW = n * DAY_W;
  const { startIdx, endIdx } = clampSegIdx(days, pStart, pEnd);
  const barLeft = startIdx * DAY_W;
  const barW = (endIdx - startIdx + 1) * DAY_W;
  const dayCells = days
    .map((d, i) => {
      const wknd = getDay(d) === 0 || getDay(d) === 6;
      const band = monthBands[i] || 'month-band-a';
      return `<div class="lane-day ${band}${wknd ? ' weekend' : ''}"></div>`;
    })
    .join('');
  return `<div class="proj-lane data-lane" style="grid-column:span ${n}">
    <div class="lane-track lane-track--proj" style="width:${trackW}px">
      <div class="proj-bar-abs" style="left:${barLeft}px;width:${barW}px"><span>${esc(projName)}</span></div>
      ${dayCells}
    </div>
  </div>`;
}

/** 里程碑一列：flex 日格 + 絕對定位色條，節點疊在色條上 */
function buildMilestoneLaneWithNodes(days, s, colorIdx, monthBands) {
  const n = days.length;
  const trackW = n * DAY_W;
  const { startIdx, endIdx } = clampSegIdx(days, s.start, s.end);
  const barLeft = startIdx * DAY_W;
  const barW = (endIdx - startIdx + 1) * DAY_W;
  const bg = MILESTONE_COLORS[colorIdx % MILESTONE_COLORS.length];
  const nodes = Array.isArray(s.detailNodes) ? s.detailNodes : [];
  const byDate = {};
  for (const node of nodes) {
    if (node?.date) byDate[node.date] = node;
  }

  const dayCells = days
    .map((d, i) => {
      const key = ymd(d);
      const node = byDate[key];
      const wknd = getDay(d) === 0 || getDay(d) === 6;
      const band = monthBands[i] || 'month-band-a';
      let overlay = '';
      if (node) {
        const meta = nodeKindMeta(node.kind);
        overlay = `<span class="node-overlay" style="background:${meta.color}" title="${esc(node.label)}（${esc(meta.label)}）"></span>`;
      }
      return `<div class="lane-day ${band}${wknd ? ' weekend' : ''}">${overlay}</div>`;
    })
    .join('');

  const bar = `<div class="ms-bar-abs" style="left:${barLeft}px;width:${barW}px;background:${bg}" title="${esc(s.label)} ${ymdZh(s.start)} — ${ymdZh(s.end)}">
      <span class="ms-bar-label">${esc(s.label)}</span>
    </div>`;

  return `<div class="ms-lane data-lane" style="grid-column:span ${n}">
    <div class="lane-track lane-track--ms" style="width:${trackW}px">
      ${bar}
      ${dayCells}
    </div>
  </div>`;
}

function buildDailyChart(days, projName, segs, pStart, pEnd) {
  const n = days.length;
  const monthBands = buildMonthBands(days);
  const cols = `${LABEL_COL_W}px repeat(${n}, ${DAY_W}px)`;
  let rows = `<span class="row-label">月份</span>
    ${buildMonthCells(days)}
    <span class="row-label row-label--static">日期</span>
    ${buildDateHeaderCells(days, monthBands)}
    <span class="row-label">專案</span>
    ${buildProjLane(days, projName, pStart, pEnd, monthBands)}`;

  segs.forEach((s, i) => {
    rows += `<span class="row-label ms-label">${esc(s.label)}</span>`;
    rows += buildMilestoneLaneWithNodes(days, s, i, monthBands);
  });

  return `<div class="chart-grid chart-grid--swimlane" style="grid-template-columns: ${cols}">${rows}</div>`;
}
/**
 * @param {{ name?, client_name?, start_date?, end_date?, budget?, description? }} project
 * @param {Array<{ label, start, end, detailNodes? }>} segments
 */
export function buildClientTimelineHtml(project, segments) {
  const projName = project?.name || '專案';
  const client = project?.client_name || '—';
  const pStart = project?.start_date;
  const pEnd = project?.end_date;
  const budget =
    project?.budget != null && project?.budget !== '' ? fmtCurrency(project.budget) : '—';
  const generated = format(new Date(), 'yyyy年M月d日 HH:mm');
  const period =
    pStart && pEnd ? `${ymdZh(pStart)} — ${ymdZh(pEnd)}` : '尚未設定專案起訖';
  const description = String(project?.description || '').trim();

  const segs = (segments || []).map((s) => ({
    label: s.label || '里程碑',
    start: s.start,
    end: s.end,
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
  allNodes.sort(
    (a, b) => a.date.localeCompare(b.date) || a.milestoneLabel.localeCompare(b.milestoneLabel)
  );

  const days = buildDays(pStart, pEnd);
  const chartW = LABEL_COL_W + days.length * DAY_W;
  const gridBg = exportGridLineCss(DAY_W);
  const nodeLegendHtml = buildNodeLegendHtml();

  const timelineBlock =
    days.length > 0
      ? `<div class="timeline-wrap">
          <div class="timeline-inner" style="min-width:${chartW}px">
            ${buildDailyChart(days, projName, segs, pStart, pEnd)}
          </div>
        </div>`
      : '<p class="muted pad">請先在專案資料設定開始／結束日期，才能產生時間軸圖。</p>';

  const milestoneNotes = segs.length
    ? `<ul class="note-list">
        ${segs
          .map(
            (s) =>
              `<li><strong>${esc(s.label)}</strong> — ${ymdZh(s.start)} 至 ${ymdZh(s.end)}</li>`
          )
          .join('')}
      </ul>`
    : '<p class="muted">尚無里程碑。</p>';

  const nodeNotes = allNodes.length
    ? `<ul class="note-list">
        ${allNodes
          .map(
            (n) =>
              `<li><span class="note-date">${esc(n.date)}</span> · <strong>${esc(n.label)}</strong> <span class="muted">（${esc(n.milestoneLabel)}）</span></li>`
          )
          .join('')}
      </ul>`
    : '<p class="muted">尚無時程節點。</p>';

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(projName)} — 專案時間軸</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
      line-height: 1.45;
    }
    .sheet {
      max-width: 100%;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px 32px 36px;
      box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
    }
    .toolbar {
      background: #0f172a;
      color: #fff;
      padding: 10px 16px;
      margin: -28px -32px 20px;
      border-radius: 12px 12px 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      font-size: 0.85rem;
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
    h1 { font-size: 1.45rem; font-weight: 700; margin: 0 0 6px; }
    .lead { color: #64748b; font-size: 0.88rem; margin: 0 0 18px; }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 20px 32px;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 22px;
      font-size: 0.88rem;
    }
    .meta-row dt { color: #64748b; font-size: 0.72rem; margin: 0 0 2px; }
    .meta-row dd { margin: 0; font-weight: 600; }
    h2 { font-size: 0.95rem; font-weight: 700; margin: 26px 0 10px; color: #334155; }
    .timeline-wrap {
      overflow-x: auto;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #fff;
      padding: 8px;
    }
    .timeline-inner { display: inline-block; min-width: 100%; }
    .chart-grid {
      display: grid;
      border: 1px solid #cbd5e1;
      background: #fff;
    }
    .row-label {
      font-size: 0.68rem;
      font-weight: 700;
      color: #64748b;
      padding: 6px 8px;
      text-align: right;
      background: #f8fafc;
      border-right: 2px solid #94a3b8;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    .day-cell {
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #e2e8f0;
      min-width: ${DAY_W}px;
      max-width: ${DAY_W}px;
    }
    .chart-grid--swimlane .data-lane {
      background-image: ${gridBg};
      background-color: #fafafa;
    }
    .chart-grid--swimlane .head-cell,
    .chart-grid--swimlane .lane-day {
      background-image: ${gridBg};
    }
    .row-label--static {
      pointer-events: none;
    }
    .node-legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 8px 12px;
      margin-bottom: 10px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.68rem;
      color: #475569;
    }
    .node-legend-title {
      font-weight: 700;
      color: #64748b;
      margin-right: 2px;
    }
    .node-legend ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
    }
    .node-legend li {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      flex-shrink: 0;
    }
    .row-label.ms-label {
      justify-content: flex-start;
      text-align: left;
      gap: 6px;
      height: ${MS_ROW_H}px;
      min-height: ${MS_ROW_H}px;
      box-sizing: border-box;
    }
    .head-cell.weekend { background-color: #fff5f5 !important; }
    .lane-day.weekend { background-color: #fff5f5; }
    .month-cell {
      max-width: none !important;
      min-width: 0;
      width: auto;
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
    }
    .month-alt-a { background: #dce3ed; }
    .month-alt-b { background: #c5d0de; }
    .head-cell.month-band-a { background: #f8fafc; }
    .head-cell.month-band-b { background: #eef2f7; }
    .lane-day.month-band-a { background-color: #fafbfc; }
    .lane-day.month-band-b { background-color: #f1f5f9; }
    .head-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2px 0;
      min-height: 36px;
    }
    .head-d { font-size: 0.72rem; font-weight: 700; color: #334155; line-height: 1.1; }
    .head-w { font-size: 0.58rem; color: #94a3b8; }
    .proj-lane,
    .ms-lane {
      max-width: none !important;
      min-width: 0;
      padding: 0;
      margin: 0;
      overflow: hidden;
      border-bottom: 1px solid #e2e8f0;
    }
    .ms-lane {
      height: ${MS_ROW_H}px;
    }
    .lane-track {
      position: relative;
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      box-sizing: border-box;
      background-color: #fafafa;
    }
    .lane-track--proj {
      height: ${MS_ROW_H}px;
    }
    .lane-track--ms {
      height: ${MS_ROW_H}px;
    }
    .lane-day {
      flex: 0 0 ${DAY_W}px;
      width: ${DAY_W}px;
      height: 100%;
      position: relative;
      box-sizing: border-box;
      border-right: 1px solid #cbd5e1;
    }
    .proj-bar-abs {
      position: absolute;
      top: 0;
      height: 100%;
      z-index: 1;
      display: flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 4px;
      background: linear-gradient(90deg, #4f46e5, #6366f1);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-sizing: border-box;
    }
    .ms-bar-abs {
      position: absolute;
      top: 0;
      height: 100%;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      box-sizing: border-box;
      pointer-events: none;
    }
    .node-overlay {
      position: absolute;
      inset: 0;
      z-index: 2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ms-bar-label {
      font-size: 0.62rem;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 8px;
      text-align: center;
      max-width: 100%;
    }
    .notes {
      margin-top: 8px;
      padding: 18px 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.84rem;
    }
    .notes h3 { font-size: 0.82rem; margin: 0 0 8px; color: #475569; font-weight: 700; }
    .notes h3:not(:first-child) { margin-top: 16px; }
    .note-list { margin: 0; padding-left: 1.2rem; }
    .note-list li { margin-bottom: 6px; }
    .note-date { color: #6366f1; font-weight: 600; font-variant-numeric: tabular-nums; }
    .muted { color: #94a3b8; }
    .pad { padding: 12px 0; }
    .footer { margin-top: 24px; font-size: 0.72rem; color: #94a3b8; text-align: center; }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border: none; padding: 0; max-width: none; }
      .toolbar { display: none !important; }
      .timeline-wrap {
        overflow: visible !important;
        border: none;
        padding: 0;
        page-break-inside: avoid;
      }
      .timeline-inner { display: inline-block; }
      .month-cell, .ms-bar-abs, .proj-bar-abs, .head-cell, .node-overlay {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .proj-bar-abs {
        background: #4f46e5 !important;
        background-image: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="toolbar">
      <span>PDF：橫向、勾選「背景圖形」；時間軸會自動縮放塞入頁寬</span>
      <button type="button" onclick="window.print()">列印 / 另存 PDF</button>
    </div>
    <h1>${esc(projName)}</h1>
    <p class="lead">專案時間軸 · 客戶版 · 產生於 ${esc(generated)}</p>
    <dl class="meta-row">
      <div><dt>客戶</dt><dd>${esc(client)}</dd></div>
      <div><dt>專案期間</dt><dd>${esc(period)}</dd></div>
      <div><dt>預算</dt><dd>${esc(budget)}</dd></div>
    </dl>
    <h2>時間軸總覽</h2>
    ${nodeLegendHtml}
    ${timelineBlock}
    <div class="notes">
      <h3>專案說明</h3>
      ${description ? `<p>${esc(description).replace(/\n/g, '<br>')}</p>` : '<p class="muted">（無專案描述）</p>'}
      <h3>里程碑</h3>
      ${milestoneNotes}
      <h3>時程節點</h3>
      ${nodeNotes}
      <h3>備註</h3>
      <p class="muted">本時間軸僅供時程溝通參考。預算：${esc(budget)}。</p>
    </div>
    <p class="footer">Studio PM · 客戶時間軸匯出</p>
  </div>
  <script>
  (function () {
    var inner = null;
    function resetScale() {
      if (!inner) inner = document.querySelector('.timeline-inner');
      if (!inner) return;
      inner.style.transform = '';
      inner.style.transformOrigin = '';
      var wrap = inner.parentElement;
      if (wrap) wrap.style.height = '';
    }
    function fitScale() {
      if (!inner) inner = document.querySelector('.timeline-inner');
      if (!inner) return;
      resetScale();
      var cw = inner.scrollWidth;
      var sheet = document.querySelector('.sheet');
      var available = (sheet ? sheet.clientWidth : window.innerWidth) - 24;
      if (available < 200) available = window.innerWidth - 40;
      var scale = cw > available ? available / cw : 1;
      if (scale < 0.995) {
        inner.style.transform = 'scale(' + scale + ')';
        inner.style.transformOrigin = 'top left';
        var wrap = inner.parentElement;
        if (wrap) wrap.style.height = Math.ceil(inner.offsetHeight * scale) + 'px';
      }
    }
    window.addEventListener('beforeprint', fitScale);
    window.addEventListener('afterprint', resetScale);
  })();
  </script>
</body>
</html>`;

  return html;
}

export function exportClientTimeline(project, segments) {
  const html = buildClientTimelineHtml(project, segments);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const fname = `${safeFilename(project?.name)}_客戶時間軸_${format(new Date(), 'yyyyMMdd')}.html`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();

  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: false, message: '請允許彈出視窗，或開啟已下載的 HTML 檔案。' };
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return { ok: true, filename: fname };
}
