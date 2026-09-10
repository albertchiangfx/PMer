'use client';

import { useEffect } from 'react';

/**
 * Esc closes an open overlay. Skip while `disabled` (e.g. saving/busy).
 * Pair with backdrop click: `e.target === e.currentTarget && !busy && onClose()`.
 */
export function useModalEscape(onClose, { disabled = false } = {}) {
  useEffect(() => {
    if (disabled || typeof onClose !== 'function') return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, disabled]);
}
