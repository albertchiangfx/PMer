/**
 * 把樣板 + 條款片段 + 資料拼成完整的 HTML 文件（含 CSS）。
 */

const { getTemplate, getClause } = require('./index');
const studio = require('./studio-config');

const BASE_CSS = `
  @page { size: A4; margin: 24mm 22mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans CJK TC', 'Noto Sans TC', 'PingFang TC',
                 'Microsoft JhengHei', system-ui, -apple-system, sans-serif;
    color: #111827;
    line-height: 1.75;
    font-size: 11pt;
  }
  .contract-header { text-align: center; margin-bottom: 18pt; }
  .contract-header h1 {
    margin: 0 0 8pt;
    font-size: 20pt;
    letter-spacing: 4pt;
    border-bottom: 2px solid #111827;
    padding-bottom: 8pt;
    display: inline-block;
  }
  .contract-header .meta { color: #6b7280; font-size: 10pt; margin: 0; }
  .preamble { margin: 12pt 0 16pt; text-indent: 2em; }
  .parties-table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  .parties-table td {
    border: 1px solid #d1d5db;
    padding: 8pt 10pt;
    vertical-align: top;
  }
  .parties-table td.role {
    width: 90pt;
    background: #f3f4f6;
    font-weight: 600;
    text-align: center;
  }
  .party-name { font-weight: 600; font-size: 12pt; margin-bottom: 4pt; }
  .party-info { color: #4b5563; font-size: 10pt; }
  .clause { margin: 14pt 0; }
  .clause h3 {
    font-size: 12pt;
    margin: 0 0 6pt;
    color: #111827;
    border-left: 4px solid #4f46e5;
    padding-left: 8pt;
  }
  .clause ol { padding-left: 20pt; margin: 4pt 0; }
  .clause ol li { margin: 4pt 0; }
  .signatures { margin-top: 32pt; page-break-inside: avoid; }
  .sign-table { width: 100%; border-collapse: collapse; }
  .sign-table td {
    width: 50%;
    vertical-align: top;
    padding: 12pt 14pt;
    border: 1px solid #d1d5db;
  }
  .sign-table p { margin: 4pt 0; }
  strong { color: #111827; }
`;

function wrapHtml(bodyHtml, title) {
  return `<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>${BASE_CSS}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

/**
 * @param {object} args
 * @param {string} args.templateId
 * @param {string[]} args.clauseIds
 * @param {object} args.contract  — DB row
 * @param {object} args.client    — DB row
 * @param {object} args.project   — DB row
 * @returns {string} full HTML document
 */
function renderContract({ templateId, clauseIds = [], contract, client, project }) {
  const tmpl = getTemplate(templateId);
  if (!tmpl) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const data = {
    studio,
    client: client || {},
    project: project || {},
    contract: contract || {},
  };

  const clauseHtml = (clauseIds || [])
    .map((id) => getClause(id))
    .filter(Boolean)
    .map((c) => c.render(data))
    .join('\n');

  let body = tmpl.render(data);
  if (body.includes('{{CLAUSES}}')) {
    body = body.replace('{{CLAUSES}}', clauseHtml);
  } else {
    body += clauseHtml;
  }

  const title = `${tmpl.name} - ${project?.name || contract?.contract_number || ''}`;
  return wrapHtml(body, title);
}

module.exports = { renderContract };
