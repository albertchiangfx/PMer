/** Fired after SchedulePanel reloads allocations (Gantt drag / modal / mount load). */
export const SCHEDULE_DATA_CHANGED_EVENT = 'sp:schedule-data-changed';

export function notifyScheduleDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SCHEDULE_DATA_CHANGED_EVENT));
}
