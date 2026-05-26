'use client';

import Link from 'next/link';
import { cardClass, pageFrameClass, pageFrameScrollClass } from '../../lib/page-layout';

const sections = [
  {
    href: '/settings/services',
    title: '服務項目庫',
    desc: '管理報價單可勾選的服務項目與預設單價（建議照工作室的常用服務一次建好，之後出報價只需勾選＋改價）。',
  },
];

export default function SettingsPage() {
  return (
    <div className={pageFrameClass}>
      <div className={pageFrameScrollClass}>
        <div className={`${cardClass} max-w-3xl mb-4`}>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">設定</h1>
          <p className="text-gray-400 text-xs md:text-sm mt-2">
            系統相關設定。點下方項目進入細項管理。
          </p>
        </div>

        <div className="grid gap-3 max-w-3xl">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`${cardClass} hover:shadow-apple-lg transition-shadow block`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base md:text-lg font-semibold text-gray-900">{s.title}</h2>
                  <p className="text-xs md:text-sm text-gray-500 mt-1 leading-relaxed">{s.desc}</p>
                </div>
                <span className="text-indigo-500 text-sm shrink-0">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
