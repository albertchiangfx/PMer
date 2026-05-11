/** Fired after SchedulePanel reloads allocations (Gantt drag / modal / mount load). */
export const SCHEDULE_DATA_CHANGED_EVENT = 'sp:schedule-data-changed';

export function notifyScheduleDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SCHEDULE_DATA_CHANGED_EVENT));
}

/** Fired after project milestones are created/updated/deleted/reordered (專案頁 ↔ Dashboard 摘要同步). */
export const MILESTONE_DATA_CHANGED_EVENT = 'sp:milestone-data-changed';

export function notifyMilestoneDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MILESTONE_DATA_CHANGED_EVENT));
}
