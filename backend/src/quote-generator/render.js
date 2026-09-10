/**
 * 把報價單資料拼成完整 HTML 文件（含 CSS），供 Puppeteer 印 PDF 或 iframe 預覽。
 *
 * 設計取向：現代極簡商業文件（接近 Stripe / Linear / Apple Invoice），
 *   - 不用大色塊分區，改用細線 + 小寫小標 + 字距追蹤
 *   - 嚴格欄位對齊（首欄左、數量置中、金額右、欄寬固定）
 *   - 中英對照用字採台灣動畫／設計業界常見格式
 */

const studio = require('../contract-generator/studio-config');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(s) {
  return escapeHtml(s).replace(/\r?\n/g, '<br/>');
}

function fmtMoney(n, currency = 'TWD') {
  const num = Number(n || 0);
  if (Number.isNaN(num)) return '';
  const symbol =
    currency === 'USD' ? 'US$' :
    currency === 'CNY' ? 'CN¥' :
    currency === 'JPY' ? 'JP¥' :
    currency === 'EUR' ? '€' :
    'NT$';
  return `${symbol} ${num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${y}.${m}.${day}`;
}

const BASE_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Noto Sans CJK TC', 'Noto Sans TC', 'PingFang TC',
                 'Microsoft JhengHei', system-ui, -apple-system, sans-serif;
    color: #0f172a;
    line-height: 1.6;
    font-size: 9.5pt;
    margin: 0;
    -webkit-font-smoothing: antialiased;
    font-variant-numeric: tabular-nums;
  }

  /* ───────── 預覽用 (iframe) ───────── */
  @media screen {
    html, body { background: #ffffff; }
    body {
      margin: 0;
      padding: 10mm 6mm 14mm;
      overflow-wrap: break-word;
    }
    .hdr { flex-wrap: wrap; gap: 16pt; }
    .info-row { flex-wrap: wrap; }
    table.items { table-layout: fixed; }
    table.items td, table.items th { word-break: break-word; }
  }

  /* 手機預覽：整體重排，header 改直列、品項表加自身橫向捲軸 (PDF 輸出不受影響) */
  @media screen and (max-width: 640px) {
    body { padding: 8mm 4mm 12mm; font-size: 9.5pt; }
    .hdr {
      flex-direction: column;
      align-items: stretch;
      gap: 14pt;
      padding-bottom: 12pt;
      margin-bottom: 16pt;
    }
    .brand .name { font-size: 14pt; }
    .brand .legal { font-size: 8pt; }
    .brand .meta { font-size: 8pt; margin-top: 8pt; }
    .title-wrap { text-align: left; }
    .hdr .title {
      font-size: 22pt;
      letter-spacing: 5pt;
      text-align: left;
      margin-bottom: 10pt;
    }
    .meta-table { margin-left: 0; width: auto; }
    .meta-table td { padding: 2pt 14pt 2pt 0; }
    .meta-table td.label { text-align: left; min-width: 0; }
    .meta-table td.value { text-align: left; min-width: 0; padding-right: 0; }

    .info-row { flex-direction: column; gap: 14pt; padding-bottom: 12pt; margin-bottom: 14pt; }

    /* 品項表獨立橫向捲軸，避免擠成一字一行 */
    .items-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 0 -4mm;
      padding: 0 4mm;
    }
    table.items { min-width: 440px; table-layout: auto; }
    table.items thead th .en { display: none; }
    table.items thead th { padding: 0 6pt 8pt; font-size: 7.5pt; }
    table.items tbody td { padding: 8pt 6pt; }
    table.items td.name { white-space: normal; }

    .totals-wrap { justify-content: stretch; }
    .totals { width: 100%; max-width: none; }
    .signature { gap: 18pt; margin-top: 28pt; }
  }

  /* ───────── Header ───────── */
  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24pt;
    padding-bottom: 16pt;
    margin-bottom: 22pt;
    border-bottom: 1.2pt solid #0f172a;
  }
  .brand { min-width: 0; flex: 1; }
  .brand .name {
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: 0.3pt;
    margin: 0;
    color: #0f172a;
  }
  .brand .legal {
    display: block;
    margin-top: 4pt;
    font-size: 8.5pt;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 0;
  }
  .brand .meta {
    margin-top: 10pt;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.7;
  }
  .title-wrap { text-align: right; min-width: 0; }
  .hdr .title {
    font-size: 26pt;
    font-weight: 400;
    letter-spacing: 7pt;
    color: #0f172a;
    margin: 0 0 12pt;
    line-height: 1;
    text-align: right;
  }
  .meta-table {
    border-collapse: collapse;
    margin-left: auto;
    font-size: 8.5pt;
  }
  .meta-table td {
    padding: 2.5pt 0 2.5pt 18pt;
    border: none;
    vertical-align: top;
    white-space: nowrap;
  }
  .meta-table td.label {
    color: #94a3b8;
    font-weight: 600;
    font-size: 7pt;
    letter-spacing: 1.4pt;
    text-transform: uppercase;
    text-align: right;
  }
  .meta-table td.value {
    text-align: right;
    font-weight: 500;
    color: #0f172a;
    min-width: 90pt;
  }

  /* ───────── Bill-to / Project ───────── */
  .info-row {
    display: flex;
    gap: 28pt;
    margin-bottom: 22pt;
    padding-bottom: 16pt;
    border-bottom: 0.6pt solid #e2e8f0;
  }
  .info-block { flex: 1; min-width: 0; }
  .info-block .label {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 1.4pt;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 6pt;
  }
  .info-block .primary {
    font-weight: 700;
    font-size: 11pt;
    color: #0f172a;
    margin-bottom: 4pt;
    line-height: 1.4;
  }
  .info-block .meta {
    color: #64748b;
    font-size: 8.5pt;
    line-height: 1.65;
  }

  /* ───────── Items table ───────── */
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
  }
  table.items thead th {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 1.4pt;
    text-transform: uppercase;
    color: #94a3b8;
    padding: 0 8pt 9pt;
    border-bottom: 1.2pt solid #0f172a;
    background: transparent;
    vertical-align: bottom;
  }
  table.items thead th.left { text-align: left; }
  table.items thead th.right { text-align: right; }
  table.items thead th.center { text-align: center; }
  table.items thead th .en {
    display: block;
    font-size: 6.5pt;
    color: #cbd5e1;
    font-weight: 600;
    margin-top: 1pt;
    letter-spacing: 1pt;
  }

  table.items .section-cell {
    text-align: left;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 1.6pt;
    text-transform: uppercase;
    color: #475569;
    padding: 16pt 8pt 5pt;
    border-bottom: 0.6pt solid #cbd5e1;
    background: transparent;
  }

  table.items tbody td {
    padding: 9pt 8pt;
    border: none;
    border-bottom: 0.6pt solid #f1f5f9;
    font-size: 9.5pt;
    vertical-align: top;
  }
  table.items td.name {
    font-weight: 600;
    color: #0f172a;
    line-height: 1.45;
  }
  table.items td.desc {
    color: #475569;
    line-height: 1.55;
  }
  table.items td.qty {
    text-align: center;
    color: #475569;
  }
  table.items td.unit {
    text-align: right;
    color: #475569;
  }
  table.items td.total {
    text-align: right;
    font-weight: 600;
    color: #0f172a;
  }
  table.items td.empty {
    text-align: center;
    color: #94a3b8;
    padding: 20pt 8pt;
    font-style: italic;
  }

  /* ───────── Totals ───────── */
  .totals-wrap {
    display: flex;
    justify-content: flex-end;
    margin-top: 20pt;
  }
  .totals {
    width: 260pt;
    max-width: 60%;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 5pt 0;
    font-size: 9.5pt;
    border-bottom: 0.6pt solid #f1f5f9;
  }
  .totals .row .label { color: #64748b; }
  .totals .row .value {
    font-weight: 500;
    color: #0f172a;
  }
  .totals .grand {
    margin-top: 6pt;
    padding-top: 10pt;
    border-top: 1.2pt solid #0f172a;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: none;
  }
  .totals .grand .label {
    font-size: 8.5pt;
    letter-spacing: 1.8pt;
    text-transform: uppercase;
    color: #0f172a;
    font-weight: 700;
  }
  .totals .grand .value {
    font-size: 15pt;
    font-weight: 700;
    color: #0f172a;
  }

  /* ───────── Notes / Terms ───────── */
  .notes {
    margin-top: 28pt;
    padding-top: 14pt;
    border-top: 0.6pt solid #e2e8f0;
  }
  .notes .label {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 1.4pt;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 6pt;
  }
  .notes pre {
    margin: 0;
    font-family: inherit;
    white-space: pre-wrap;
    line-height: 1.65;
    color: #475569;
    font-size: 9pt;
  }

  /* ───────── Signature ───────── */
  .signature {
    display: flex;
    gap: 36pt;
    margin-top: 40pt;
    page-break-inside: avoid;
  }
  .signature .col { flex: 1; min-width: 0; }
  .signature .line {
    border-bottom: 0.8pt solid #94a3b8;
    height: 36pt;
  }
  .signature .caption {
    margin-top: 5pt;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 1.4pt;
    text-transform: uppercase;
    color: #64748b;
  }
`;

function brandName() {
  const name = escapeHtml(studio.name || 'Studio');
  const legal = studio.legal_name && studio.legal_name !== studio.name
    ? `<span class="legal">${escapeHtml(studio.legal_name)}</span>`
    : '';
  return `<h1 class="name">${name}${legal}</h1>`;
}

function brandMeta() {
  const lines = [];
  if (studio.address) lines.push(escapeHtml(studio.address));
  const contactLine = [];
  if (studio.contact_phone) contactLine.push(`T  ${escapeHtml(studio.contact_phone)}`);
  if (studio.contact_email) contactLine.push(`E  ${escapeHtml(studio.contact_email)}`);
  if (contactLine.length) lines.push(contactLine.join('　·　'));
  if (studio.tax_id) lines.push(`統一編號 ${escapeHtml(studio.tax_id)}`);
  return lines.join('<br/>');
}

function clientMeta(client) {
  if (!client) return '';
  const parts = [];
  if (client.address) parts.push(escapeHtml(client.address));
  const contactLine = [];
  if (client.contact_email) contactLine.push(`E  ${escapeHtml(client.contact_email)}`);
  if (client.contact_phone) contactLine.push(`T  ${escapeHtml(client.contact_phone)}`);
  if (contactLine.length) parts.push(contactLine.join('　·　'));
  if (client.tax_id) parts.push(`統一編號 ${escapeHtml(client.tax_id)}`);
  return parts.join('<br/>');
}

/**
 * @param {object} args
 * @param {object} args.quotation  DB row + items[]
 * @param {object} args.client     DB row
 * @param {object} args.project    DB row
 */
function renderQuotation({ quotation, client, project }) {
  const q = quotation || {};
  const items = Array.isArray(q.items) ? q.items : [];

  // 依 section_label 群組（保留原順序）
  const sections = [];
  const sectionIdx = new Map();
  for (const it of items) {
    const key = it.section_label || '';
    if (!sectionIdx.has(key)) {
      sectionIdx.set(key, sections.length);
      sections.push({ label: key, items: [] });
    }
    sections[sectionIdx.get(key)].items.push(it);
  }

  const itemsHtml = sections
    .map((sec) => {
      const head = sec.label
        ? `<tr><td colspan="5" class="section-cell">${escapeHtml(sec.label)}</td></tr>`
        : '';
      const rows = sec.items
        .map((it) => {
          const nameHtml = escapeHtml(it.name || '');
          const descMain = it.description ? nl2br(it.description) : '';
          return `
            <tr>
              <td class="name">${nameHtml}</td>
              <td class="desc">${descMain}</td>
              <td class="qty">${Number(it.qty || 0)}</td>
              <td class="unit">${fmtMoney(it.unit_price, q.currency)}</td>
              <td class="total">${fmtMoney(it.line_total, q.currency)}</td>
            </tr>
          `;
        })
        .join('');
      return head + rows;
    })
    .join('');

  const taxRatePct = (Number(q.tax_rate || 0) * 100)
    .toFixed(2)
    .replace(/\.00$/, '');

  return `<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(q.quote_number || '')} – ${escapeHtml(project?.name || q.title || '')}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <header class="hdr">
    <div class="brand">
      ${brandName()}
      <div class="meta">${brandMeta()}</div>
    </div>
    <div class="title-wrap">
      <div class="title">QUOTATION</div>
      <table class="meta-table">
        <tr>
          <td class="label">報價編號 No.</td>
          <td class="value">${escapeHtml(q.quote_number || '—')}</td>
        </tr>
        <tr>
          <td class="label">報價日期 Issued</td>
          <td class="value">${escapeHtml(fmtDate(q.issued_date) || '—')}</td>
        </tr>
        <tr>
          <td class="label">有效期限 Valid Until</td>
          <td class="value">${escapeHtml(fmtDate(q.valid_until) || '—')}</td>
        </tr>
      </table>
    </div>
  </header>

  <section class="info-row">
    <div class="info-block">
      <div class="label">客戶 Bill To</div>
      <div class="primary">${escapeHtml(client?.name || '—')}</div>
      ${clientMeta(client) ? `<div class="meta">${clientMeta(client)}</div>` : ''}
    </div>
    <div class="info-block">
      <div class="label">專案 Project</div>
      <div class="primary">${escapeHtml(q.title || project?.name || '—')}</div>
      ${
        q.currency
          ? `<div class="meta">幣別 Currency　·　${escapeHtml(q.currency)}</div>`
          : ''
      }
    </div>
  </section>

  <div class="items-scroll">
    <table class="items">
      <thead>
        <tr>
          <th class="left" style="width:22%">項目<span class="en">Item</span></th>
          <th class="left" style="width:40%">規格說明<span class="en">Description</span></th>
          <th class="center" style="width:8%">數量<span class="en">Qty</span></th>
          <th class="right" style="width:14%">單價<span class="en">Unit Price</span></th>
          <th class="right" style="width:16%">金額<span class="en">Amount</span></th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml || '<tr><td colspan="5" class="empty">尚未輸入報價項目</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="totals-wrap">
    <div class="totals">
      <div class="row">
        <span class="label">小計　Subtotal</span>
        <span class="value">${fmtMoney(q.subtotal, q.currency)}</span>
      </div>
      <div class="row">
        <span class="label">稅率　Tax Rate</span>
        <span class="value">${taxRatePct}%</span>
      </div>
      <div class="row">
        <span class="label">稅額　Tax</span>
        <span class="value">${fmtMoney(q.tax_due, q.currency)}</span>
      </div>
      <div class="grand">
        <span class="label">總計　Total</span>
        <span class="value">${fmtMoney(q.total, q.currency)}</span>
      </div>
    </div>
  </div>

  ${
    q.notes
      ? `<section class="notes">
          <div class="label">備註與條款　Terms &amp; Notes</div>
          <pre>${nl2br(q.notes)}</pre>
        </section>`
      : ''
  }

  <section class="signature">
    <div class="col">
      <div class="line"></div>
      <div class="caption">客戶簽核　Authorized Signature</div>
    </div>
    <div class="col">
      <div class="line"></div>
      <div class="caption">日期　Date</div>
    </div>
  </section>
</body>
</html>`;
}

module.exports = { renderQuotation };
