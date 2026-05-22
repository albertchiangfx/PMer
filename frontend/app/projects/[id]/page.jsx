'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { notifyScheduleDataChanged } from '../../../lib/dashboard-sync';
import { validateIntervalWithinProject } from '../../../lib/projectScheduleBounds';
import { fmtCurrency, statusStyle, fmt, initials } from '../../../lib/utils';
import TaskCard from '../../../components/TaskCard';
import Gantt from '../../../components/Gantt';
import ProjectMilestoneTimeline from '../../../components/ProjectMilestoneTimeline';
import ProjectMilestonesPanel from '../../../components/ProjectMilestonesPanel';
import ProjectScheduleMobileOverview from '../../../components/ProjectScheduleMobileOverview';
import ProjectScheduleVerticalTimeline from '../../../components/ProjectScheduleVerticalTimeline';
import { useIsMobileLayout } from '../../../lib/use-mobile-layout';

const TASK_TYPES = [
  'general',
  'modeling',
  'rigging',
  'animation',
  'rendering',
  'compositing',
  'vfx',
  'audio',
  'review',
];
const PRIORITIES = ['low', 'medium', 'high'];
const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'];

function routeParamId(raw) {
  if (raw == null) return '';
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v ?? '').trim();
}

/** 專案／任務表單用的 YYYY-MM-DD（API DATE 或 ISO 字串） */
function sliceProjectYmd(d) {
  if (d == null || d === '') return '';
  return String(d).slice(0, 10);
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = routeParamId(params?.id);
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [projectAllocations, setProjectAllocations] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskModal, setTaskModal] = useState(null);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(defaultTaskForm());
  const [allocForm, setAllocForm] = useState(defaultAllocForm());
  const isMobileLayout = useIsMobileLayout();
  const [tab, setTab] = useState('gantt');
  const [ganttMode, setGanttMode] = useState('milestones');
  const [projDropdownOpen, setProjDropdownOpen] = useState(false);
  const projDropdownRef = useRef(null);

  useEffect(() => {
    setTab(isMobileLayout ? 'schedule' : 'gantt');
  }, [id, isMobileLayout]);

  useEffect(() => {
    if (!isMobileLayout && tab === 'schedule') setTab('gantt');
  }, [isMobileLayout, tab]);

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

  const projectBoundsYmd = useMemo(
    () => ({
      start: sliceProjectYmd(project?.start_date),
      end: sliceProjectYmd(project?.end_date),
    }),
    [project?.start_date, project?.end_date]
  );
  const scheduleBoundaryForAllocation = useCallback(
    () =>
      projectBoundsYmd.start && projectBoundsYmd.end
        ? { start: projectBoundsYmd.start, end: projectBoundsYmd.end }
        : null,
    [projectBoundsYmd.start, projectBoundsYmd.end]
  );

  const load = useCallback(async () => {
    if (!id) return;
    const [proj, taskList, memberList, allocs, projList] = await Promise.all([
      api.getProject(id),
      api.getTasks({ project_id: id }),
      api.getTeamMembers(),
      api.getProjectAllocations(id),
      api.getProjects(),
    ]);
    setProject(proj);
    setTasks(taskList);
    setMembers(memberList);
    setProjectAllocations(allocs);
    setAllProjects(projList);
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, id]);

  useEffect(() => {
    const syncHash = () => {
      if (typeof window === 'undefined') return;
      const h = window.location.hash;
      if (h === '#milestones') setTab('milestones');
      else if (h === '#tasks') setTab('tasks');
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!projDropdownOpen) return;
    const onDocClick = (e) => {
      if (projDropdownRef.current && !projDropdownRef.current.contains(e.target)) {
        setProjDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [projDropdownOpen]);

  const saveTask = async (e) => {
    e.preventDefault();
    const data = { ...taskForm, project_id: id };
    const memberId = taskForm.team_member_id || '';
    if (memberId && (!taskForm.start_date || !taskForm.end_date)) {
      alert('已指派成員時，請填寫開始／結束日期');
      return;
    }
    if (
      projectBoundsYmd.start &&
      projectBoundsYmd.end &&
      taskForm.start_date &&
      taskForm.end_date
    ) {
      const v = validateIntervalWithinProject(
        taskForm.start_date,
        taskForm.end_date,
        projectBoundsYmd.start,
        projectBoundsYmd.end
      );
      if (!v.ok) {
        alert(v.message);
        return;
      }
    }

    try {
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
          alert(err.message || '指派失敗');
          return;
        }
      }
      setTaskModal(null);
      await load();
      notifyScheduleDataChanged();
    } catch (err) {
      alert(err.message || '任務儲存失敗');
    }
  };

  const delTask = async (t) => {
    if (!confirm(`刪除任務「${t.name}」？`)) return;
    await api.deleteTask(t.id);
    await load();
    notifyScheduleDataChanged();
  };

  const saveProjectAlloc = async (e) => {
    e.preventDefault();
    if (!allocForm.member_id || !allocForm.start_date || !allocForm.end_date) {
      alert('請選擇成員並填寫開始／結束日期');
      return;
    }
    if (projectBoundsYmd.start && projectBoundsYmd.end) {
      const v = validateIntervalWithinProject(
        allocForm.start_date,
        allocForm.end_date,
        projectBoundsYmd.start,
        projectBoundsYmd.end
      );
      if (!v.ok) {
        alert(v.message);
        return;
      }
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
        alert(
          `時程衝突：${err.data.conflicts.map((c) => c.project_name || c.task_name || '分配').join('、')}`
        );
      } else {
        alert(err.message || '建立失敗');
      }
    }
  };

  const refreshGantt = useCallback(() => {
    load();
  }, [load]);

  if (!id) return <div className="p-8 text-gray-400">無效的專案網址</div>;
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[240px]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!project) return <div className="p-8 text-gray-400">找不到專案</div>;

  const s = statusStyle(project.status);

  return (
    <div className="px-1 py-2 md:p-8 w-full max-w-full mx-auto animate-fade-in">
      {/* Breadcrumb — current project name is a dropdown that lets you switch
          to another project without going back to the projects list. */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-3 md:mb-6">
        <Link href="/projects" className="hover:text-gray-600">
          專案
        </Link>
        <span>/</span>
        <div className="relative" ref={projDropdownRef}>
          <button
            type="button"
            onClick={() => setProjDropdownOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-gray-700 font-medium hover:text-indigo-600 focus:outline-none"
          >
            <span>{project.name}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${projDropdownOpen ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {projDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 z-30 w-72 bg-white rounded-apple-xl shadow-apple-lg ring-1 ring-black/5 py-1.5 max-h-80 overflow-y-auto">
              {allProjects.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">無其他專案</div>
              ) : (
                allProjects.map((p) => {
                  const isCurrent = p.id === project.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProjDropdownOpen(false);
                        if (!isCurrent) router.push(`/projects/${p.id}`);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${isCurrent ? 'bg-indigo-50/60' : ''}`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color || '#6366f1' }}
                      />
                      <span
                        className={`flex-1 truncate ${isCurrent ? 'text-indigo-700 font-semibold' : 'text-gray-700'}`}
                      >
                        {p.name}
                      </span>
                      {p.client_name && (
                        <span className="text-[11px] text-gray-400 truncate max-w-[40%]">
                          {p.client_name}
                        </span>
                      )}
                      {isCurrent && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-indigo-600 shrink-0"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Header（較緊湊約 90%） */}
      <div className="bg-white rounded-2xl md:rounded-apple-xl shadow-apple p-3.5 md:p-5 mb-3 md:mb-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-2.5 md:gap-3 min-w-0 flex-1">
            <div
              className="w-1.5 md:w-2.5 h-12 md:h-14 rounded-full shrink-0"
              style={{ backgroundColor: project.color || '#6366f1' }}
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-snug break-words">
                {project.name}
              </h1>
              <p className="text-gray-400 text-[12px] md:text-[13px] mt-0.5 break-words">
                {project.client_name || '無客戶'}{' '}
                {project.client_email && `· ${project.client_email}`}
              </p>
              {project.description && (
                <p className="text-gray-600 text-[12px] md:text-[13px] mt-1.5 leading-relaxed break-words">
                  {project.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center shrink-0 md:pt-0.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 md:px-3 md:py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {project.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-3 pt-3 md:mt-5 md:pt-5 border-t border-gray-100">
          <Stat label="預算" value={project.budget ? fmtCurrency(project.budget) : '—'} />
          <Stat label="任務" value={tasks.length} />
          <Stat label="開始" value={fmt(project.start_date)} />
          <Stat label="結束" value={fmt(project.end_date)} />
        </div>
      </div>

      {/* Tabs — 桌機（維持原順序與預設） */}
      <div className="hidden md:flex gap-1 mb-6 bg-white p-1.5 rounded-apple shadow-apple-sm w-fit flex-wrap">
        {[
          ['gantt', '甘特圖'],
          ['milestones', '項目'],
          ['team', '成員'],
          ['tasks', '任務'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-indigo-600 text-white shadow-apple-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabs — 手機 */}
      <div className="flex md:hidden gap-0.5 mb-3 bg-white p-0.5 rounded-xl shadow-apple-sm w-full overflow-x-auto">
        {[
          ['schedule', '時程總覽'],
          ['milestones', '項目'],
          ['team', '成員'],
          ['tasks', '任務'],
          ['gantt', '時程預覽'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${tab === k ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'schedule' && isMobileLayout && (
        <ProjectScheduleMobileOverview projectId={id} project={project} />
      )}

      {tab === 'milestones' && (
        <div
          id="milestones"
          className="surface rounded-2xl md:rounded-[22px] p-3.5 md:p-6 shadow-apple-sm scroll-mt-24 relative z-[5] isolate"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">專案項目</h2>
              <p className="text-xs text-gray-500 mt-1">
                套用公版、調整順序與勾選完成度會反映在 Dashboard「Tasks
                overview」與本頁「專案」列表的進度條上。
              </p>
            </div>
          </div>
          <ProjectMilestonesPanel projectId={id} projectName={project.name} />
        </div>
      )}

      {tab === 'tasks' && (
        <div id="tasks" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">任務清單</h2>
            <button
              onClick={() => {
                setTaskForm({
                  ...defaultTaskForm(),
                  start_date: sliceProjectYmd(project?.start_date),
                  end_date: sliceProjectYmd(project?.end_date),
                });
                setTaskModal('create');
              }}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-apple font-medium transition-colors"
            >
              + 新增任務
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((t) => (
              <div key={t.id}>
                <TaskCard
                  task={t}
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
                  onDelete={delTask}
                />
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
              <div
                key={a.id}
                className="surface rounded-xl md:rounded-[18px] flex flex-wrap items-center gap-3 md:gap-4 px-2.5 py-2.5 md:px-4 md:py-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                    style={{ backgroundColor: a.avatar_color || '#6366f1' }}
                  >
                    {initials(a.member_name || '')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.member_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {fmt(a.start_date)} — {fmt(a.end_date)}
                    </p>
                  </div>
                </div>
                {a.notes && (
                  <p className="text-xs text-slate-600 flex-1 min-w-[160px]">{a.notes}</p>
                )}
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
        <>
          <div className="hidden md:block space-y-4">
            <div className="inline-flex rounded-xl border border-slate-200/90 bg-white/80 p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setGanttMode('milestones')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  ganttMode === 'milestones'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                項目時程
              </button>
              <button
                type="button"
                onClick={() => setGanttMode('members')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  ganttMode === 'members'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                成員分配
              </button>
            </div>

            {ganttMode === 'members' ? (
              <Gantt
                members={members}
                allocations={projectAllocations}
                onUpdate={load}
                rangeWeeks={12}
                showRowDelete
                lockMemberRowOnMove
                labelColumnTitle="成員"
                scheduleBoundaryForAllocation={scheduleBoundaryForAllocation}
              />
            ) : (
              <ProjectMilestoneTimeline
                projectId={id}
                project={project}
                rangeWeeks={12}
                pastWeeks={4}
                onProjectDatesSaved={() => load()}
              />
            )}
          </div>

          <div className="md:hidden">
            <ProjectScheduleVerticalTimeline projectId={id} project={project} />
          </div>
        </>
      )}

      {/* Task Modal */}
      {taskModal && (
        <Modal
          title={taskModal === 'create' ? '新增任務' : '編輯任務'}
          onClose={() => setTaskModal(null)}
        >
          <form onSubmit={saveTask} className="space-y-4">
            <div>
              <Label>任務名稱 *</Label>
              <Input
                value={taskForm.name}
                onChange={(v) => setTaskForm((f) => ({ ...f, name: v }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>類型</Label>
                <Select
                  value={taskForm.task_type}
                  onChange={(v) => setTaskForm((f) => ({ ...f, task_type: v }))}
                  options={TASK_TYPES}
                />
              </div>
              <div>
                <Label>狀態</Label>
                <Select
                  value={taskForm.status}
                  onChange={(v) => setTaskForm((f) => ({ ...f, status: v }))}
                  options={TASK_STATUSES}
                />
              </div>
              <div>
                <Label>優先級</Label>
                <Select
                  value={taskForm.priority}
                  onChange={(v) => setTaskForm((f) => ({ ...f, priority: v }))}
                  options={PRIORITIES}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>開始日期</Label>
                <Input
                  type="date"
                  value={taskForm.start_date}
                  onChange={(v) => setTaskForm((f) => ({ ...f, start_date: v }))}
                  min={projectBoundsYmd.start || undefined}
                  max={projectBoundsYmd.end || undefined}
                />
              </div>
              <div>
                <Label>結束日期</Label>
                <Input
                  type="date"
                  value={taskForm.end_date}
                  onChange={(v) => setTaskForm((f) => ({ ...f, end_date: v }))}
                  min={projectBoundsYmd.start || undefined}
                  max={projectBoundsYmd.end || undefined}
                />
              </div>
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
              <textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple"
              >
                {taskModal === 'create' ? '建立任務' : '儲存'}
              </button>
              <button
                type="button"
                onClick={() => setTaskModal(null)}
                className="px-4 text-sm text-gray-500"
              >
                取消
              </button>
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
              <Select
                value={allocForm.member_id}
                onChange={(v) => setAllocForm((f) => ({ ...f, member_id: v }))}
                options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.role})` }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>開始日期</Label>
                <Input
                  type="date"
                  value={allocForm.start_date}
                  onChange={(v) => setAllocForm((f) => ({ ...f, start_date: v }))}
                  required
                  min={projectBoundsYmd.start || undefined}
                  max={projectBoundsYmd.end || undefined}
                />
              </div>
              <div>
                <Label>結束日期</Label>
                <Input
                  type="date"
                  value={allocForm.end_date}
                  onChange={(v) => setAllocForm((f) => ({ ...f, end_date: v }))}
                  required
                  min={projectBoundsYmd.start || undefined}
                  max={projectBoundsYmd.end || undefined}
                />
              </div>
            </div>
            <div>
              <Label>備註</Label>
              <Input
                value={allocForm.notes}
                onChange={(v) => setAllocForm((f) => ({ ...f, notes: v }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-apple"
              >
                建立
              </button>
              <button
                type="button"
                onClick={() => setAllocModalOpen(false)}
                className="px-4 text-sm text-gray-500"
              >
                取消
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-base font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Label({ children }) {
  return <label className="block text-xs font-medium text-gray-500 mb-1.5">{children}</label>;
}
function Input({ type = 'text', value, onChange, required, placeholder, min, max }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      min={min}
      max={max}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  );
}
function Select({ value, onChange, options, required }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full bg-gray-50 border border-gray-200 rounded-apple px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">請選擇</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
