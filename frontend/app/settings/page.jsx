'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { cardClass, pageFrameClass, pageFrameScrollClass } from '../../lib/page-layout';
import { api } from '../../lib/api';

const sections = [
  {
    href: '/settings/services',
    title: '服務項目庫',
    desc: '管理報價單可勾選的服務項目與預設單價（建議照工作室的常用服務一次建好，之後出報價只需勾選＋改價）。',
  },
];

export default function SettingsPage() {
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [createForm, setCreateForm] = useState({ username: '', display_name: '', role: 'pm' });
  const [created, setCreated] = useState(null); // {activation_url, user}

  const isAdmin = me?.role === 'admin';

  const load = async () => {
    const m = await api.me();
    setMe(m);
    if (m?.role === 'admin') {
      const [u, c] = await Promise.all([api.adminListUsers(), api.adminAuthConfig()]);
      setUsers(Array.isArray(u) ? u : []);
      setCfg(c || null);
    }
  };

  useEffect(() => {
    load().catch((err) => {
      alert(err?.message || String(err) || '載入失敗');
    });
  }, []);

  const activationUrl = (token) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/activate?token=${encodeURIComponent(token)}`;

  const onLogout = async () => {
    setBusy(true);
    try {
      await api.logout();
      window.location.href = '/login';
    } finally {
      setBusy(false);
    }
  };

  const onCreateUser = async () => {
    if (!createForm.username.trim()) return;
    setBusy(true);
    try {
      const res = await api.adminCreateUser({
        username: createForm.username.trim(),
        display_name: createForm.display_name.trim() || null,
        role: createForm.role,
      });
      const url = activationUrl(res.activation_token);
      setCreated({ activation_url: url, user: res.user, expires_at: res.expires_at });
      setCreateForm({ username: '', display_name: '', role: 'pm' });
      await load();
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // ignore
      }
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onUpdateUser = async (id, patch) => {
    setBusy(true);
    try {
      await api.adminUpdateUser(id, patch);
      await load();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRevokeSessions = async (id) => {
    if (!confirm('要撤銷此使用者所有登入（強制登出）？')) return;
    setBusy(true);
    try {
      await api.adminRevokeSessions(id);
      await load();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onResetPassword = async (id) => {
    if (!confirm('要產生新的啟用連結並要求此使用者重設密碼？')) return;
    setBusy(true);
    try {
      const res = await api.adminNewActivation(id);
      const url = activationUrl(res.activation_token);
      setCreated({ activation_url: url, user: users.find((u) => u.id === id) || null, expires_at: res.expires_at });
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // ignore
      }
      await load();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const sortedUsers = useMemo(() => users.slice().sort((a, b) => String(a.username).localeCompare(String(b.username))), [users]);

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameScrollClass}>
        <div className={`${cardClass} max-w-3xl mx-auto mb-4 w-full`}>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">設定</h1>
          <p className="text-gray-400 text-xs md:text-sm mt-2">
            系統相關設定。點下方項目進入細項管理。
          </p>
        </div>

        <div className={`${cardClass} max-w-3xl mx-auto mb-4 w-full`}>
          <h2 className="text-base md:text-lg font-semibold text-gray-900">帳號</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{me?.display_name || me?.username || '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">角色：{me?.role || '—'}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onLogout}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              登出
            </button>
          </div>
          {me?.must_change_password && (
            <p className="text-xs text-amber-700 mt-3">
              此帳號尚未完成密碼設定，請至「變更密碼」頁完成設定。
            </p>
          )}
          <Link href="/set-password" className="inline-block mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
            變更密碼 →
          </Link>
        </div>

        <div className="grid gap-3 max-w-3xl mx-auto w-full">
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

        {isAdmin && (
          <div className={`${cardClass} max-w-3xl mx-auto mt-4 w-full`}>
            <h2 className="text-base md:text-lg font-semibold text-gray-900">使用者管理（Admin）</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              建立帳號後會產生一次性「啟用連結」，使用者自行設定密碼。連結請不要貼進 git 或任何公開地方。
            </p>

            {cfg && (
              <div className="mt-3 text-xs text-gray-500">
                Session 時效：{cfg.session_ttl_hours} 小時 · 啟用連結時效：{cfg.activation_ttl_hours} 小時
                <span className="text-gray-400">（目前由環境變數控制）</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="username（英數 . _ -）"
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm"
              />
              <input
                value={createForm.display_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="顯示名稱（選填）"
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm"
              />
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm"
              >
                <option value="pm">pm</option>
                <option value="artist">artist</option>
                <option value="finance">finance</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={onCreateUser}
                className="h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                建立帳號
              </button>
            </div>

            {created?.activation_url && (
              <div className="mt-4 p-3 rounded-xl border border-indigo-100 bg-indigo-50/40">
                <p className="text-xs font-semibold text-indigo-800">啟用連結（已嘗試自動複製）</p>
                <p className="text-xs text-indigo-700 mt-1 break-all">{created.activation_url}</p>
                {created.expires_at && (
                  <p className="text-[11px] text-indigo-700/80 mt-1">有效至：{String(created.expires_at)}</p>
                )}
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  onClick={() => navigator.clipboard.writeText(created.activation_url)}
                >
                  複製連結
                </button>
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-2 pr-4">帳號</th>
                    <th className="py-2 pr-4">顯示名稱</th>
                    <th className="py-2 pr-4">角色</th>
                    <th className="py-2 pr-4">狀態</th>
                    <th className="py-2 pr-0 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u) => {
                    const disabled = !!u.disabled_at;
                    return (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4 font-mono text-xs text-gray-800">{u.username}</td>
                        <td className="py-2 pr-4">
                          <input
                            value={u.display_name || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, display_name: v } : x)));
                            }}
                            onBlur={(e) => onUpdateUser(u.id, { display_name: e.target.value || null })}
                            className="h-9 px-2 rounded-lg border border-gray-200 text-sm w-48"
                            placeholder="—"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            value={u.role}
                            onChange={(e) => onUpdateUser(u.id, { role: e.target.value })}
                            className="h-9 px-2 rounded-lg border border-gray-200 text-sm"
                          >
                            <option value="pm">pm</option>
                            <option value="artist">artist</option>
                            <option value="finance">finance</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {disabled ? (
                            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">已停用</span>
                          ) : (
                            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">啟用中</span>
                          )}
                        </td>
                        <td className="py-2 pr-0">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onResetPassword(u.id)}
                              className="h-9 px-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              重設密碼
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onRevokeSessions(u.id)}
                              className="h-9 px-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              強制登出
                            </button>
                            <button
                              type="button"
                              disabled={busy || u.username === me?.username}
                              onClick={() => onUpdateUser(u.id, { disabled: !disabled })}
                              className={`h-9 px-2 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                                disabled
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                              title={u.username === me?.username ? '不可停用自己' : ''}
                            >
                              {disabled ? '啟用' : '停用'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
