/** Fired after SchedulePanel reloads allocations (Gantt drag / modal / mount load). */
export const SCHEDULE_DATA_CHANGED_EVENT = 'sp:schedule-data-changed';

/** @param {Record<string, unknown>} [detail] 例如 `{ source: 'schedule-panel' }` 讓發送端略過自身監聽。 */
export function notifyScheduleDataChanged(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SCHEDULE_DATA_CHANGED_EVENT, { detail: detail ?? {} }));
}

/** Fired after project milestones are created/updated/deleted/reordered (專案頁 ↔ Dashboard 摘要同步). */
export const MILESTONE_DATA_CHANGED_EVENT = 'sp:milestone-data-changed';

export function notifyMilestoneDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MILESTONE_DATA_CHANGED_EVENT));
}
