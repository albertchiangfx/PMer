'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { fmtCurrency, statusStyle, fmt, initials } from '../../../lib/utils';
import TaskCard from '../../../components/TaskCard';
import Gantt from '../../../components/Gantt';

const TASK_TYPES = ['general', 'modeling', 'rigging', 'animation', 'rendering', 'compositing', 'vfx', 'audio', 'review'];
const PRIORITIES = ['low', 'medium', 'high'];
const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [projectAllocations, setProjectAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskModal, setTaskModal] = useState(null);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(defaultTaskForm());
  const [allocForm, setAllocForm] = useState(defaultAllocForm());
  const [tab, setTab] = useState('tasks');
  const [ganttWeeks, setGanttWeeks] = useState(12);

  function defaultTaskForm() {
    return {
      name: '',
      description: '',
      task_type: 'general',
      status: 'todo',
      priority: 'medium',
      start_date: '',
      end_date: '',
      team_member_id: '',
    };
  }
  function defaultAllocForm() {
    return { member_id: '', start_date: '', end_date: '', notes: '' };
  }

  const load = useCallback(async () => {
    const [proj, taskList, memberList, allocs] = await Promise.all([
      api.getProject(id),
      api.getTasks({ project_id: id }),
      api.getTeamMembers(),
      api.getProjectAllocations(id),
    ]);
    setProject(proj);
    setTasks(taskList);
    setMembers(memberList);
    setProjectAllocations(allocs);
  }, [id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const saveTask = async (e) => {
    e.preventDefault();
    const data = { ...taskForm, project_id: id };
    const memberId = taskForm.team_member_id || '';
    if (memberId && (!taskForm.start_date || !taskForm.end_date)) {
      alert('已指派成員時，請填寫開始／結束日期');
      return;
    }

    let saved;
    if (taskModal === 'create') saved = await api.createTask(data);
    else saved = await api.updateTask(taskModal.id, data);

    // Optional: create a legacy task allocation row for assignee (used by TaskCard and task schedule).
    if (taskModal === 'create' && memberId) {
      try {
        await api.createTimeAllocation({
          task_id: saved.id,
          team_member_id: memberId,
          start_date: taskForm.start_date,
          end_date: taskForm.end_date,
          allocated_days: 1,
          allocated_hours: 8,
        });
      } catch (err) {
        if (err.status === 409) {
          alert('指派失敗：該員工時程衝突，請調整日期');
          return;
        }
        alert(err.message || '指派失敗');
        return;
      }
    }
    setTaskModal(null);
    load();
  };

  const delTask = async (t) => {
    if (!confirm(`刪除任務「${t.name}」？`)) return;
    await api.deleteTask(t.id);
    load();
  };

  const saveProjectAlloc = async (e) => {
    e.preventDefault();
    if (!allocForm.member_id || !allocForm.start_date || !allocForm.end_date) {
      alert('請選擇成員並填寫開始／結束日期');
      return;
    }
    try {
      await api.createAllocation({
        project_id: id,
        member_id: allocForm.member_id,
        start_date: allocForm.start_date,
        end_date: allocForm.end_date,
        notes: allocForm.notes || undefined,
      });
      setAllocModalOpen(false);
      setAllocForm(defaultAllocForm());
      load();
    } catch (err) {
      if (err.data?.conflicts?.length) {
        alert(`時程衝突：${err.data.conflicts.map((c) => c.project_name || c.task_name || '分配').join('、')}`);
      } else {
        alert(err.message || '建立失敗');
      }
    }
  };

  const refreshGantt = useCallback(() => {
    load();
  }, [load]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!project) return <div className="p-8 text-gray-400">找不到專案</div>;

  const s = statusStyle(project.status);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/projects" className="hover:text-gray-600">專案</Link>
        <span>/</span>
        <span className="text-gray-700">{project.name}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-apple-xl shadow-apple p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-3 h-16 rounded-full" style={{ backgroundColor: project.color || '#6366f1' }} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <p className="text-gray-400 text-sm mt-1">{project.client_name || '無客戶'} {project.client_email && `· ${project.client_email}`}</p>
              {project.description && <p className="text-gray-600 text-sm mt-2 max-w-xl">{project.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {project.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <Stat label="預算" value={project.budget ? fmtCurrency(project.budget) : '—'} />
          <Stat label="任務" value={tasks.length} />
          <Stat label="開始" value={fmt(project.start_date)} />
          <Stat label="結束" value={fmt(project.end_date)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white p-1.5 rounded-apple shadow-apple-sm w-fit flex-wrap">
        {[['tasks', '任務'], ['team', '成員分配'], ['gantt', '甘特圖']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-indigo-600 text-white shadow-apple-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'tasks' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">任務清單</h2>
            <button onClick={() => { setTaskForm(defaultTaskForm()); setTaskModal('create'); }}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-apple font-medium transition-colors">
              + 新增任務
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(t => (
              <div key={t.id}>
                <TaskCard task={t}
                  onEdit={(t) => {
                    setTaskForm({
                      name: t.name,
                      description: t.description || '',
                      task_type: t.task_type,
                      status: t.status,
                      priority: t.priority,
                      start_date: t.start_date || '',
                      end_date: t.end_date || '',
                      team_member_id: '',
                    });
                    setTaskModal(t);
                  }}
                  onDelete={delTask} />
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="col-span-3 bg-white rounded-apple-lg shadow-apple p-12 text-center">
                <p className="text-gray-400 text-sm">尚無任務</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">成員分配（依專案）</h2>
            <button
              type="button"
              onClick={() => {
                setAllocForm(defaultAllocForm());
                setAllocModalOpen(true);
              }}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-apple font-medium transition-colors"
            >
              + 新增分配
            </button>
          </div>
          <div className="space-y-2">
            {projectAllocations.map((a) => (
              <div key={a.id} className="surface rounded-[18px] flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                    style={{ backgroundColor: a.avatar_color || '#6366f1' }}
                  >
                    {initials(a.member_name || '')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.member_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{fmt(a.start_date)} — {fmt(a.end_date)}</p>
                  </div>
                </div>
                {a.notes && <p className="text-xs text-slate-600 flex-1 min-w-[160px]">{a.notes}</p>}
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('刪除此筆時間分配？')) return;
                    await api.deleteAllocation(a.id);
                    load();
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium ml-auto"
                >
                  刪除
                </button>
              </div>
            ))}
            {projectAllocations.length === 0 && (
              <div className="surface rounded-[18px] py-12 text-center text-sm text-slate-400">
                尚無分配，請按「新增分配」或使用甘特圖拖拉調整。
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'gantt' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-slate-500">
              橫軸為時間；縱軸每一列為一筆分配（同人可多列）。拖拉條可改日期，上下拖拉可改指派成員。列旁可刪除該筆分配。
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href={`/projects/${id}/schedule`}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
              >
                開啟專案時程甘特（全頁）→
              </Link>
            <select
              value={ganttWeeks}
              onChange={(e) => setGanttWeeks(Number(e.target.value))}
              className="bg-white/55 border border-white/60 rounded-2xl px-3 py-2 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
            >
              <option value={8}>8 週</option>
              <option value={12}>12 週</option>
              <option value={16}>16 週</option>
              <option value={24}>24 週</option>
            </select>
            </div>
          </div>
          <Gantt
            members={members}
            allocations={projectAllocations}
            onUpdate={refreshGantt}
            rangeWeeks={ganttWeeks}
            showRowDelete
            labelColumnTitle="成員"
          />
        </div>
      )}

      {/* Task Modal */}
      {taskModal && (
        <Modal title={taskModal === 'create' ? '新增任務' : '編輯任務'} onClose={() => setTaskModal(null)}>
          <form onSubmit={saveTask} className="space-y-4">
            <div>
              <Label>任務名稱 *</Label>
              <Input value={taskForm.name} onChange={v => setTaskForm(f => ({ ...f, name: v }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>類型</Label>
                <Select value={taskForm.task_type} onChange={v => setTaskForm(f => ({ ...f, task_type: v }))} options={TASK_TYPES} />
              </div>
              <div>
                <Label>狀態</Label>
                <Select value={taskForm.status} onChange={v => setTaskForm(f => ({ ...f, status: v }))} options={TASK_STATUSES} />
              </div>
              <div>
                <Label>優先級</Label>
                <Select value={taskForm.priority} onChange={v => setTaskForm(f => ({ ...f, priority: v }))} options={PRIORITIES} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>開始日期</Label><Input type="date" value={taskForm.start_date} onChange={v => setTaskForm(f => ({ ...f, start_date: v }))} /></div>
              <div><Label>結束日期</Label><Input type="date" value={taskForm.end_date} onChange={v => setTaskForm(f => ({ ...f, end_date: v }))} /></div>
            </div>
            <div>
              <Label>指派給</Label>
              <Select
                value={taskForm.team_member_id}
                onChange={(v) => setTaskForm((f) => ({ ...f, team_member_id: v }))}
                options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.role})` }))}
              />
            </div>
            <div>
              <Label>描述</Label>
              <textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple">
                {taskModal === 'create' ? '建立任務' : '儲存'}
              </button>
              <button type="button" onClick={() => setTaskModal(null)} className="px-4 text-sm text-gray-500">取消</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Project allocation modal */}
      {allocModalOpen && (
        <Modal title="新增專案時間分配" onClose={() => setAllocModalOpen(false)}>
          <form onSubmit={saveProjectAlloc} className="space-y-4">
            <div>
              <Label>成員 *</Label>
              <Select value={allocForm.member_id} onChange={v => setAllocForm(f => ({ ...f, member_id: v }))}
                options={members.map(m => ({ value: m.id, label: `${m.name} (${m.role})` }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>開始日期</Label><Input type="date" value={allocForm.start_date} onChange={v => setAllocForm(f => ({ ...f, start_date: v }))} required /></div>
              <div><Label>結束日期</Label><Input type="date" value={allocForm.end_date} onChange={v => setAllocForm(f => ({ ...f, end_date: v }))} required /></div>
            </div>
            <div>
              <Label>備註</Label>
              <Input value={allocForm.notes} onChange={v => setAllocForm(f => ({ ...f, notes: v }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple">建立</button>
              <button type="button" onClick={() => setAllocModalOpen(false)} className="px-4 text-sm text-gray-500">取消</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div><p className="text-xs text-gray-400">{label}</p><p className="text-base font-semibold text-gray-900 mt-0.5">{value}</p></div>;
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Label({ children }) { return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>; }
function Input({ type = 'text', value, onChange, required, placeholder }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
    className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />;
}
function Select({ value, onChange, options, required }) {
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <select value={value} onChange={e => onChange(e.target.value)} required={required}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
      <option value="">請選擇</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
