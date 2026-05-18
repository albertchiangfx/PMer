import { eachDayOfInterval, format, parseISO, isValid, getDay } from 'date-fns';
import { fmtCurrency } from './utils';

const DAY_W = 30;

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

const NODE_FILL = '#818cf8';

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

/** 里程碑：連續橫條跨過週末，文字單行置中 */
function buildMilestoneLane(days, segs) {
  const n = days.length;
  if (!n) return '';
  const bars = segs
    .map((s, i) => {
      let startIdx = dayIndex(days, s.start);
      let endIdx = dayIndex(days, s.end);
      if (startIdx < 0) startIdx = 0;
      if (endIdx < 0) endIdx = n - 1;
      if (endIdx < startIdx) endIdx = startIdx;
      const colStart = startIdx + 1;
      const colEnd = endIdx + 2;
      const bg = MILESTONE_COLORS[i % MILESTONE_COLORS.length];
      return `<div class="ms-bar" style="grid-column:${colStart} / ${colEnd};background:${bg}" title="${esc(s.label)} ${ymdZh(s.start)} — ${ymdZh(s.end)}">
        <span class="ms-bar-label">${esc(s.label)}</span>
      </div>`;
    })
    .join('');
  return `<div class="ms-lane" style="grid-column:span ${n}">
    <div class="ms-track" style="grid-template-columns:repeat(${n},${DAY_W}px)">${bars}</div>
  </div>`;
}

function buildNodeCells(days, allNodes, monthBands) {
  const byDate = {};
  for (const n of allNodes) {
    const k = n.date;
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(n);
  }
  return days
    .map((d, i) => {
      const key = ymd(d);
      const list = byDate[key] || [];
      const wknd = getDay(d) === 0 || getDay(d) === 6;
      const band = monthBands?.[i] || 'month-band-a';
      if (!list.length) {
        return `<div class="day-cell node-cell empty ${band}${wknd ? ' weekend' : ''}"></div>`;
      }
      const notes = list
        .map((n) => `<span class="node-note">${esc(n.label)}</span>`)
        .join('');
      return `<div class="day-cell node-cell filled ${band}${wknd ? ' weekend' : ''}">
        <div class="node-fill"></div>
        <div class="node-notes">${notes}</div>
      </div>`;
    })
    .join('');
}

function buildDailyChart(days, projName, segs, allNodes) {
  const n = days.length;
  const monthBands = buildMonthBands(days);
  const cols = `72px repeat(${n}, ${DAY_W}px)`;
  return `<div class="chart-grid" style="grid-template-columns: ${cols}">
    <span class="row-label">月份</span>
    ${buildMonthCells(days)}
    <span class="row-label">日期</span>
    ${buildDateHeaderCells(days, monthBands)}
    <span class="row-label">專案</span>
    <div class="day-cell proj-cell" style="grid-column: span ${n}">
      <span class="proj-bar">${esc(projName)}</span>
    </div>
    <span class="row-label">里程碑</span>
    ${buildMilestoneLane(days, segs)}
    <span class="row-label">節點</span>
    ${buildNodeCells(days, allNodes, monthBands)}
  </div>`;
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
        allNodes.push({ date: n.date, label: n.label, milestoneLabel: s.label });
      }
    }
  }
  allNodes.sort(
    (a, b) => a.date.localeCompare(b.date) || a.milestoneLabel.localeCompare(b.milestoneLabel)
  );

  const days = buildDays(pStart, pEnd);
  const chartW = 72 + days.length * DAY_W;

  const timelineBlock =
    days.length > 0
      ? `<div class="timeline-wrap">
          <div class="timeline-inner" style="min-width:${chartW}px">
            ${buildDailyChart(days, projName, segs, allNodes)}
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
      border-right: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      min-width: ${DAY_W}px;
      max-width: ${DAY_W}px;
    }
    .head-cell.weekend { background-color: #fff5f5 !important; }
    .node-cell.empty.weekend { background-color: #fff8f8 !important; }
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
    .node-cell.empty.month-band-a { background: #fafbfc; }
    .node-cell.empty.month-band-b { background: #f1f5f9; }
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
    .proj-cell {
      padding: 0;
      border-bottom: 1px solid #e2e8f0;
      max-width: none !important;
      min-width: 0;
    }
    .proj-bar {
      display: block;
      margin: 6px 4px;
      padding: 6px 10px;
      border-radius: 6px;
      background: linear-gradient(90deg, #4f46e5, #6366f1);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ms-lane {
      max-width: none !important;
      min-width: 0;
      padding: 3px 0;
      border-bottom: 1px solid #e2e8f0;
      background: #fafafa;
    }
    .ms-track {
      display: grid;
      min-height: 30px;
      align-items: stretch;
    }
    .ms-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 2px 1px;
      border-radius: 4px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      min-height: 26px;
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
    .node-cell {
      min-height: 38px;
      display: flex;
      flex-direction: column;
      padding: 0;
      background: #fff;
    }
    .node-cell.filled { background: #fff !important; }
    .node-cell.filled .node-fill {
      flex: 0 0 12px;
      min-height: 12px;
      background: ${NODE_FILL};
    }
    .node-notes {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 1px 2px 2px;
      flex: 1;
      justify-content: flex-end;
    }
    .node-note {
      font-size: 0.52rem;
      font-weight: 600;
      color: #1e293b;
      text-align: center;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      .month-cell, .ms-bar, .proj-bar, .node-fill, .head-cell, .node-cell {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .proj-bar {
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
