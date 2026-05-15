'use client';

import Link from 'next/link';

export default function BackToDashboard({ className = '' }) {
  return (
    <div className={className}>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-2xl bg-white/55 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white/70 transition"
      >
        <span className="h-5 w-5">
          <IconArrowLeft />
        </span>
        回到 Dashboard
      </Link>
    </div>
  );
}

function IconArrowLeft() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
