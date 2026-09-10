'use client';

import { useState } from 'react';

const LOGO_SRC_W = 195;
const LOGO_SRC_H = 67;
const LOGO_MARK_SRC_W = 52;

function LogoMarkFallback({ size, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="5" height="14" rx="1" fill="currentColor" transform="skewX(-12)" />
      <rect x="9.5" y="5" width="5" height="14" rx="1" fill="currentColor" transform="skewX(-12)" />
      <rect x="16" y="5" width="5" height="14" rx="1" fill="currentColor" transform="skewX(-12)" />
    </svg>
  );
}

export default function CompanyLogo({ size = 24, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <LogoMarkFallback size={size} className={className} />;
  }

  const renderedW = size * (LOGO_SRC_W / LOGO_SRC_H);
  const clipW = size * (LOGO_MARK_SRC_W / LOGO_SRC_H);

  return (
    <span
      className={`inline-flex overflow-hidden shrink-0 items-center justify-start ${className}`}
      style={{ width: clipW, height: size }}
      role="img"
      aria-label="multi.design studio"
    >
      <img
        src="/company-logo.png"
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className="block h-full w-auto max-w-none select-none"
        style={{ width: `${renderedW}px` }}
      />
    </span>
  );
}
