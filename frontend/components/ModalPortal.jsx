'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把子元素 portal 到 document.body。
 *
 * 為什麼需要：AppShell 的 `.shell` 套了 `backdrop-filter`，這會建立新的
 * containing block，讓裡面 `position: fixed` 的 modal 變成相對於 `.shell`，
 * 又被 `.shell` 的 `overflow:hidden` 切掉。Portal 到 body 後 fixed 就會
 * 真的相對於 viewport，內容無論多長都可以靠頁面捲軸看完。
 */
export default function ModalPortal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
