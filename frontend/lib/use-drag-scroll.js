'use client';

import { useEffect, useRef } from 'react';

const FRICTION = 0.92;
const MIN_VELOCITY = 0.35;
const DRAG_THRESHOLD = 6;
const AXIS_LOCK_RATIO = 1.25;

/** 按住拖曳橫向捲動（含慣性）；在可垂直捲動區內優先上下滑 */
export function useDragScroll(enabled = true) {
  const ref = useRef(null);
  const stateRef = useRef({
    dragging: false,
    axisLocked: null,
    moved: false,
    startX: 0,
    startY: 0,
    scrollStart: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    raf: null,
  });

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const state = stateRef.current;

    const stopMomentum = () => {
      if (state.raf != null) {
        cancelAnimationFrame(state.raf);
        state.raf = null;
      }
    };

    const runMomentum = () => {
      if (Math.abs(state.velocity) < MIN_VELOCITY) {
        state.raf = null;
        el.classList.remove('is-drag-scrolling');
        return;
      }
      el.scrollLeft += state.velocity;
      state.velocity *= FRICTION;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft <= 0 || el.scrollLeft >= max) {
        state.velocity *= 0.35;
      }
      state.raf = requestAnimationFrame(runMomentum);
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (
        e.target?.closest?.(
          'a, button, input, textarea, select, [role="button"], .client-public__quote-pdf-btn'
        )
      ) {
        return;
      }

      stopMomentum();
      state.dragging = true;
      state.axisLocked = null;
      state.moved = false;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.lastX = e.clientX;
      state.lastT = performance.now();
      state.velocity = 0;
      state.scrollStart = el.scrollLeft;
    };

    const onPointerMove = (e) => {
      if (!state.dragging) return;

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;

      if (!state.axisLocked) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (Math.abs(dy) > Math.abs(dx) * AXIS_LOCK_RATIO) {
          if (
            e.target?.closest?.(
              '.client-public__quote-body, .client-public__quote-html, .client-public__quote-actions'
            )
          ) {
            state.dragging = false;
            return;
          }
          state.axisLocked = 'y';
          state.dragging = false;
          return;
        }
        state.axisLocked = 'x';
        state.moved = true;
        el.classList.add('is-drag-scrolling');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (state.axisLocked !== 'x') return;

      e.preventDefault();
      const now = performance.now();
      const dt = Math.max(now - state.lastT, 1);
      const instantV = (e.clientX - state.lastX) / dt;
      state.velocity = state.velocity * 0.55 + instantV * -12;
      state.lastX = e.clientX;
      state.lastT = now;
      el.scrollLeft = state.scrollStart - dx;
    };

    const endDrag = (e) => {
      if (!state.dragging && !state.moved) return;

      const wasHorizontal = state.axisLocked === 'x' && state.moved;
      state.dragging = false;
      state.axisLocked = null;

      try {
        if (e?.pointerId != null) el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      if (wasHorizontal) {
        if (Math.abs(state.velocity) >= MIN_VELOCITY) {
          state.raf = requestAnimationFrame(runMomentum);
        } else {
          el.classList.remove('is-drag-scrolling');
        }
        const suppressClick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          el.removeEventListener('click', suppressClick, true);
        };
        el.addEventListener('click', suppressClick, true);
      } else {
        el.classList.remove('is-drag-scrolling');
      }

      state.moved = false;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', endDrag);

    return () => {
      stopMomentum();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('pointerleave', endDrag);
      el.classList.remove('is-drag-scrolling');
    };
  }, [enabled]);

  return ref;
}
