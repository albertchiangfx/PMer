'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordPageContent />
    </Suspense>
  );
}

function SetPasswordPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const [me, setMe] = useState(null);
  const [current, setCurrent] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.me().then((m) => {
      if (!m) router.replace(`/login?next=${encodeURIComponent(next)}`);
      else setMe(m);
    }).catch(() => router.replace(`/login?next=${encodeURIComponent(next)}`));
  }, [router, next]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!p1 || p1 !== p2) {
      setErr('兩次密碼輸入不一致');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ current_password: current, new_password: p1 });
      router.replace(next);
    } catch (e2) {
      setErr(e2?.message || '更新失敗');
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-apple p-5">
        <h1 className="text-lg font-bold text-gray-900">變更密碼</h1>
        <p className="text-xs text-gray-500 mt-1">為了安全，請更新你的密碼。</p>

        <label className="block text-xs font-medium text-gray-600 mt-4">目前密碼</label>
        <input
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="block text-xs font-medium text-gray-600 mt-3">新密碼</label>
        <input
          value={p1}
          onChange={(e) => setP1(e.target.value)}
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <label className="block text-xs font-medium text-gray-600 mt-3">再次輸入</label>
        <input
          value={p2}
          onChange={(e) => setP2(e.target.value)}
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? '更新中…' : '更新密碼'}
        </button>
      </form>
    </div>
  );
}

