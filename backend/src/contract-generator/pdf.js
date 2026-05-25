/**
 * 將完整 HTML 文件交給 puppeteer 印成 PDF Buffer。
 *
 * 使用 puppeteer-core + 系統 Chromium（避免下載 ~150MB Chromium）。
 *   Docker：PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser（由 Alpine 套件提供）
 *   本機：自行安裝 chromium 或 google-chrome，並設定 PUPPETEER_EXECUTABLE_PATH。
 */

const DEFAULT_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

let _browserPromise = null;

function resolveExecutablePath() {
  const fs = require('fs');
  for (const p of DEFAULT_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function getBrowser() {
  if (_browserPromise) return _browserPromise;

  const puppeteer = require('puppeteer-core');
  const executablePath = resolveExecutablePath();
  if (!executablePath) {
    throw new Error(
      '找不到 Chromium 可執行檔。請安裝系統 Chromium（Docker Alpine：apk add chromium），或設定 PUPPETEER_EXECUTABLE_PATH。'
    );
  }

  _browserPromise = puppeteer.launch({
    headless: 'new',
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  const browser = await _browserPromise;
  browser.on('disconnected', () => {
    _browserPromise = null;
  });
  return browser;
}

/**
 * @param {string} html  full HTML document
 * @returns {Promise<Buffer>}
 */
async function htmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '24mm', bottom: '24mm', left: '22mm', right: '22mm' },
    });
    return buf;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { htmlToPdf };
