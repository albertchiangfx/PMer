/** 手機版頁面／字卡邊距，與專案詳情頁、AppShell 一致 */

/* 注意：AppShell 的 <main> 已經提供 md:px-8 md:py-6 padding，
   所以這裡不再重複加大內距，避免內容被擠到下方被切掉。 */
const pageShellPad = 'px-1 py-2 md:p-0 max-w-7xl mx-auto w-full animate-fade-in';

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

/* 統一玻璃語言：所有列表卡片使用 .surface（deboss 玻璃），不再死白 */
export const cardClass = 'surface rounded-xl md:rounded-apple-lg p-3 md:p-5';
