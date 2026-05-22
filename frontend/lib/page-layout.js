/** 手機版頁面／字卡邊距，與專案詳情頁、AppShell 一致 */

const pageShellPad = 'px-1 py-2 md:p-8 max-w-7xl mx-auto w-full animate-fade-in';

/**
 * 固定高度 shell 內的頁面外框：不整頁捲動。
 * 標題／控制列放 pageFrameHeaderClass，字卡列表放 pageFrameScrollClass。
 */
export const pageFrameClass = `${pageShellPad} flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden max-sm:overflow-y-auto`;

export const pageFrameHeaderClass = 'shrink-0';

export const pageFrameScrollClass =
  'scroll-pane flex-1 min-h-0';

/** 列表捲動區與上方控制列的間距（專案／客戶等） */
export const pageFrameScrollInsetClass = 'scroll-pane flex-1 min-h-0 pt-3 md:pt-4';

export const pageFrameFooterClass = 'shrink-0';

/** @deprecated 請改用 pageFrameClass */
export const pageShellClass = pageFrameClass;

/**
 * 桌面主列固定高度（見 globals.css `.app-shell-row`）。
 */
export const shellRowHeightClass = 'app-shell-row';

/** @deprecated 請改用 pageFrameClass + pageFrameScrollClass */
export const pageShellListClass = pageFrameClass;

/** @deprecated 請改用 pageFrameScrollClass */
export const pageScrollListClass = pageFrameScrollClass;

export const pageShellClassNoMax = 'px-1 py-2 md:p-8 w-full animate-fade-in';

export const surfaceSectionClass = 'surface rounded-xl md:rounded-[22px]';

export const surfacePadClass = 'p-3 md:p-6';

export const cardClass = 'bg-white rounded-xl md:rounded-apple-lg shadow-apple p-3 md:p-5';
