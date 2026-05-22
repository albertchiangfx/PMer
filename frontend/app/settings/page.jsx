'use client';

import { cardClass, pageFrameClass, pageFrameScrollClass } from '../../lib/page-layout';

export default function SettingsPage() {
  return (
    <div className={pageFrameClass}>
      <div className={pageFrameScrollClass}>
      <div className={`${cardClass} max-w-2xl`}>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">設定</h1>
        <p className="text-gray-400 text-xs md:text-sm mt-2">
          此頁先預留作為導覽入口，之後可放系統設定、偏好與權限管理。
        </p>
      </div>
      </div>
    </div>
  );
}
