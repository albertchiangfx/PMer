'use client';

import { useEffect, useRef } from 'react';
import Gantt from './Gantt';
import ModalPortal from './ModalPortal';
import ProjectMilestoneTimeline from './ProjectMilestoneTimeline';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isFocusableVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return el.getClientRects().length > 0;
}

/**
 * Near-fullscreen host for project schedule editing.
 * Portaled to document.body so AppShell `.shell` backdrop-filter cannot trap it.
 */
export default function ProjectGanttFullscreen({
  open,
  onClose,
  returnFocusRef,
  projectId,
  project,
  projectName,
  ganttMode,
  onGanttModeChange,
  members,
  allocations,
  onAllocationsUpdate,
  scheduleBoundaryForAllocation,
  onProjectDatesSaved,
  rangeWeeks = 12,
  pastWeeks = 4,
  emptyHint = '尚無時間分配，請關閉後在專案頁按『新增分配』。',
}) {
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const shell = document.querySelector('.shell');
    const prevInert = shell ? shell.inert : undefined;
    if (shell) shell.inert = true;

    // ModalPortal mounts on a subsequent tick; retry until the close control exists.
    let focusTries = 0;
    const focusTimer = window.setInterval(() => {
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
        window.clearInterval(focusTimer);
      } else if (++focusTries > 30) {
        window.clearInterval(focusTimer);
      }
    }, 16);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const nodes = [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isFocusableVisible);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(focusTimer);
      document.body.style.overflow = prevOverflow;
      if (shell) shell.inert = Boolean(prevInert);
      window.removeEventListener('keydown', onKey);
      const restore = returnFocusRef?.current;
      if (restore && typeof restore.focus === 'function') {
        restore.focus();
      }
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        ref={dialogRef}
        className="fixed inset-0 z-[200] flex flex-col bg-slate-100 animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={projectName || '專案甘特圖編輯'}
      >
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 bg-white">
          <h2 className="min-w-0 text-sm font-semibold text-slate-900 truncate">
            {projectName || '專案'}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => onGanttModeChange?.('milestones')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  ganttMode === 'milestones'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                項目時程
              </button>
              <button
                type="button"
                onClick={() => onGanttModeChange?.('members')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  ganttMode === 'members'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                成員分配
              </button>
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              關閉
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-semibold text-slate-500">
                Esc
              </kbd>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              aria-label="關閉展開編輯"
              title="關閉（Esc）"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          {ganttMode === 'members' ? (
            <Gantt
              embedded
              members={members}
              allocations={allocations}
              onUpdate={onAllocationsUpdate}
              rangeWeeks={rangeWeeks}
              showRowDelete
              lockMemberRowOnMove
              labelColumnTitle="成員"
              scheduleBoundaryForAllocation={scheduleBoundaryForAllocation}
              emptyHint={emptyHint}
            />
          ) : (
            <ProjectMilestoneTimeline
              projectId={projectId}
              project={project}
              rangeWeeks={rangeWeeks}
              pastWeeks={pastWeeks}
              onProjectDatesSaved={onProjectDatesSaved}
              compactChrome
            />
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

function IconClose({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}
