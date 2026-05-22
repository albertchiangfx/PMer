'use client';

import { useEffect, useState } from 'react';

/** 與 Tailwind `md` 一致：&lt; 768px 視為手機版版面 */
export const MOBILE_MAX_WIDTH_PX = 767;

export function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return isMobile;
}
