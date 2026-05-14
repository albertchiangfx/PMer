/** API / 表單用的 YYYY-MM-DD */
export function sliceYmd(v) {
  if (v == null || v === '') return '';
  return String(v).slice(0, 10);
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 * 僅在專案同時有開始與結束時檢查；缺其一則不限制（與舊資料相容）。
 */
export function validateIntervalWithinProject(startYmd, endYmd, projStartYmd, projEndYmd) {
  const pS = sliceYmd(projStartYmd);
  const pE = sliceYmd(projEndYmd);
  if (!pS || !pE) return { ok: true };
  if (!startYmd || !endYmd) return { ok: true };
  const a = sliceYmd(startYmd);
  const b = sliceYmd(endYmd);
  const s = a <= b ? a : b;
  const e = a <= b ? b : a;
  if (s < pS || e > pE) {
    return { ok: false, message: `起訖須在專案範圍內（${pS}～${pE}）。` };
  }
  return { ok: true };
}
