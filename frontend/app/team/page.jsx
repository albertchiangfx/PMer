'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import TeamMemberCard from '../../components/TeamMemberCard';
import BackToDashboard from '../../components/BackToDashboard';

const ROLES = ['美術總監', '3D 建模師', '材質師', '動畫師', 'Rigging 師', '特效師', '合成師', '技術總監', '製作人', '導演', '音效師', '後製'];

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(defaultForm());

  function defaultForm() {
    return { name: '', role: '3D 建模師', hourly_rate: '', status: 'active', email: '', phone: '', avatar_color: '' };
  }

  const load = useCallback(async () => {
    setMembers(await api.getTeamMembers());
  }, []);

  useEffect(() => {
    load()
      .catch((e) => {
        console.error(e);
      })
      .finally(() => setLoading(false));
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const data = { ...form, hourly_rate: form.hourly_rate || 0 };
    if (modal === 'create') await api.createTeamMember(data);
    else await api.updateTeamMember(modal.id, data);
    setModal(null);
    load();
  };

  const del = async (m) => {
    if (!confirm(`刪除「${m.name}」？`)) return;
    await api.deleteTeamMember(m.id);
    load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in">
      <BackToDashboard className="mb-4" />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">團隊成員</h1>
          <p className="text-gray-400 mt-1 text-sm">{members.filter(m => m.status === 'active').length} 位活躍成員</p>
        </div>
        <button onClick={() => { setForm(defaultForm()); setModal('create'); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors">
          + 新增成員
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {members.map(m => (
            <TeamMemberCard key={m.id} member={m}
              onEdit={(m) => { setForm({ name: m.name, role: m.role, hourly_rate: m.hourly_rate, status: m.status, email: m.email || '', phone: m.phone || '', avatar_color: m.avatar_color || '' }); setModal(m); }}
              onDelete={del} />
          ))}
          {members.length === 0 && (
            <div className="col-span-4 bg-white rounded-apple-xl shadow-apple p-20 text-center">
              <p className="text-gray-400">尚無成員</p>
              <button onClick={() => { setForm(defaultForm()); setModal('create'); }} className="mt-3 text-indigo-600 text-sm font-medium">+ 新增第一位成員</button>
            </div>
          )}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold">{modal === 'create' ? '新增成員' : '編輯成員'}</h2>
              <button onClick={() => setModal(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">姓名 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">角色</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">狀態</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="active">活躍</option>
                    <option value="inactive">暫停</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">時薪（USD）</label>
                <input type="number" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} placeholder="0.00"
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">電話</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple">
                  {modal === 'create' ? '新增' : '儲存'}
                </button>
                <button type="button" onClick={() => setModal(null)} className="px-4 text-sm text-gray-500">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
