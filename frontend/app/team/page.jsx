'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../lib/api';
import TeamMemberCard from '../../components/TeamMemberCard';
import BackToDashboard from '../../components/BackToDashboard';
import {
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollClass,
} from '../../lib/page-layout';

const ROLES = [
  '美術總監',
  '3D 建模師',
  '材質師',
  '動畫師',
  'Rigging 師',
  '特效師',
  '合成師',
  '技術總監',
  '製作人',
  '導演',
  '音效師',
  '後製',
];

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(defaultForm());
  // Edit-lock: edit modal opens read-only; user must flip the "啟用編輯" toggle
  // before name/role/etc inputs accept input and the delete button appears.
  const [editUnlocked, setEditUnlocked] = useState(false);

  function defaultForm() {
    return {
      name: '',
      role: '3D 建模師',
      hourly_rate: '',
      status: 'active',
      email: '',
      phone: '',
      avatar_color: '',
      employment_type: 'permanent',
    };
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
    setEditUnlocked(false);
    load();
  };

  const del = async (m) => {
    if (!confirm(`刪除「${m.name}」？`)) return;
    await api.deleteTeamMember(m.id);
    setModal(null);
    setEditUnlocked(false);
    load();
  };

  // Split members into 固定 / Freelance rows. 固定 always first.
  const grouped = useMemo(() => {
    const permanent = members.filter((m) => (m.employment_type || 'permanent') === 'permanent');
    const freelance = members.filter((m) => m.employment_type === 'freelance');
    return { permanent, freelance };
  }, [members]);

  const openCreate = () => {
    setForm(defaultForm());
    setEditUnlocked(true); // create modal: always editable
    setModal('create');
  };

  const openEdit = (m) => {
    setForm({
      name: m.name,
      role: m.role,
      hourly_rate: m.hourly_rate,
      status: m.status,
      email: m.email || '',
      phone: m.phone || '',
      avatar_color: m.avatar_color || '',
      employment_type: m.employment_type || 'permanent',
    });
    setEditUnlocked(false); // edit modal: locked by default
    setModal(m);
  };

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
      <BackToDashboard className="mb-2 md:mb-4" />
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">團隊成員</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {members.filter((m) => m.status === 'active').length} 位活躍成員
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
        >
          + 新增成員
        </button>
      </div>
      </div>

      <div className={pageFrameScrollClass}>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-apple-xl shadow-apple p-20 text-center">
          <p className="text-gray-400">尚無成員</p>
          <button onClick={openCreate} className="mt-3 text-indigo-600 text-sm font-medium">
            + 新增第一位成員
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          <Section
            title="固定成員"
            subtitle={`${grouped.permanent.length} 位`}
            members={grouped.permanent}
            onEdit={openEdit}
            emptyText="尚無固定成員"
          />
          <Section
            title="Freelance"
            subtitle={`${grouped.freelance.length} 位`}
            members={grouped.freelance}
            onEdit={openEdit}
            emptyText="尚無 Freelance 成員"
          />
        </div>
      )}
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-semibold">
                {modal === 'create' ? '新增成員' : '編輯成員'}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>

            {/* Edit-lock toggle. Hidden in create mode (always unlocked). */}
            {modal !== 'create' && (
              <div className="px-6 pt-5 -mb-1">
                <label className="flex items-center gap-3 select-none cursor-pointer">
                  <span className="text-xs font-medium text-gray-500 flex-1">
                    啟用編輯（鎖定中以避免誤改）
                  </span>
                  <span
                    onClick={() => setEditUnlocked((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editUnlocked ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    role="switch"
                    aria-checked={editUnlocked}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editUnlocked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                    />
                  </span>
                </label>
              </div>
            )}

            <form onSubmit={save} className="p-6 space-y-4">
              <fieldset disabled={!editUnlocked} className="space-y-4 disabled:opacity-60">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">姓名 *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">角色</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">類型</label>
                    <select
                      value={form.employment_type}
                      onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                    >
                      <option value="permanent">固定</option>
                      <option value="freelance">Freelance</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">狀態</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                    >
                      <option value="active">活躍</option>
                      <option value="inactive">暫停</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      時薪（USD）
                    </label>
                    <input
                      type="number"
                      value={form.hourly_rate}
                      onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">電話</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                  />
                </div>
              </fieldset>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={!editUnlocked}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-apple"
                >
                  {modal === 'create' ? '新增' : '儲存'}
                </button>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 text-sm text-gray-500"
                >
                  取消
                </button>
              </div>

              {/* Delete only appears in edit mode AND when unlocked. Hidden by default
                  to prevent accidental clicks. */}
              {modal !== 'create' && editUnlocked && (
                <div className="pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => del(modal)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    刪除此成員
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, members, onEdit, emptyText }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3 px-1">
        <h2 className="text-sm font-semibold text-gray-700 tracking-wide">{title}</h2>
        <span className="text-[11px] text-gray-400">{subtitle}</span>
      </div>
      {members.length === 0 ? (
        <div className="rounded-apple-xl bg-white/40 border border-dashed border-white/70 p-6 text-center text-xs text-gray-400">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {members.map((m) => (
            <TeamMemberCard key={m.id} member={m} onEdit={onEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
