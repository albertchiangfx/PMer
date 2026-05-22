/**
 * 列表搜尋：連續子字串 + 子序（自動 wildcard，使用者不必打 *）。
 * 例：「ar」可命中「ACER」（a…r）。
 */

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .trim();
}

/** 查詢字元是否依序出現在字串中（中間可跳字） */
export function matchesSubsequence(haystack, query) {
  const h = norm(haystack);
  const q = norm(query);
  if (!q) return true;
  let i = 0;
  for (let j = 0; j < h.length && i < q.length; j++) {
    if (h[j] === q[i]) i++;
  }
  return i === q.length;
}

function tokenMatches(haystack, token) {
  const h = norm(haystack);
  const t = norm(token);
  if (!t) return true;
  return h.includes(t) || matchesSubsequence(h, t);
}

/**
 * @param {string} haystack 要比對的合併字串
 * @param {string} query 使用者輸入（空白分隔多關鍵字為 AND）
 */
export function matchSearchHaystack(haystack, query) {
  const q = norm(query);
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((tok) => tokenMatches(haystack, tok));
}
