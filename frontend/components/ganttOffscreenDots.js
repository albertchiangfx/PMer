/**
 * 甘特「卷出畫面」提示點預設樣式（程式 fallback）。
 * **若要拖拉選色**：工作時程頁頂部「提示點」的 `<input type="color">`（會寫入 localStorage）。
 */
export const GANTT_OFFSCREEN_DOT_STORAGE_KEY = 'gantt-offscreen-dot';

export const GANTT_OFFSCREEN_DOT = {
  width: 7,
  height: 7,
  borderRadius: 9999,
  backgroundColor: 'rgb(145, 147, 190)',
  boxShadow: '0 0 0 2px rgb(201, 201, 201)',
};

/** Matches timeline bars rendered at `left: gridStartPx + insetPx` inside the track */
export const GANTT_BAR_EDGE_INSET_PX = 2;

/**
 * True when the painted bar's left edge has reached or passed the viewport cut line
 * (between pinned columns and scrolling timeline).
 */
export function barTouchesTimelineViewportLeft(gridStartPx, scrollLeftPx, pinnedLeftW, insetPx = GANTT_BAR_EDGE_INSET_PX) {
  const eps = 0.5;
  const barContentLeft = pinnedLeftW + gridStartPx + insetPx;
  return barContentLeft <= scrollLeftPx + eps;
}
