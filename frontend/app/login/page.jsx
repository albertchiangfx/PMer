'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import CompanyLogo from '../../components/CompanyLogo';
import { STUDIO_NAME } from '../../lib/studio-brand';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.me().then((me) => {
      if (me) router.replace(next);
    }).catch(() => {});
  }, [router, next]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const me = await api.login({ username, password });
      if (me?.must_change_password) {
        router.replace(`/set-password?next=${encodeURIComponent(next)}`);
      } else {
        router.replace(next);
      }
    } catch (e2) {
      setErr(e2?.message || '登入失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-apple-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <CompanyLogo size={26} className="text-slate-900" />
          <p className="text-sm font-semibold text-slate-900">{STUDIO_NAME}</p>
        </div>
        <h1 className="text-xl font-bold text-gray-900">登入</h1>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          請輸入工作室提供的帳號與密碼。
        </p>

        <label className="block text-xs font-medium text-gray-600 mt-4">帳號</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="username"
        />

        <label className="block text-xs font-medium text-gray-600 mt-3">密碼</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          type="password"
          className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="••••••••••"
        />

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  );
}

