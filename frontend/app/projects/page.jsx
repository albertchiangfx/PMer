'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { api } from '../../lib/api';
import { fmtCurrency, statusStyle, fmt } from '../../lib/utils';
import BackToDashboard from '../../components/BackToDashboard';
import {
  MILESTONE_DATA_CHANGED_EVENT,
  notifyMilestoneDataChanged,
  notifyScheduleDataChanged,
} from '../../lib/dashboard-sync';
import {
  cardClass,
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollInsetClass,
} from '../../lib/page-layout';
import {
  filterAndSortProjects,
  PROJECT_SORT_OPTIONS,
  PROJECT_STATUS_FILTER_OPTS,
} from '../../lib/project-list-sort';
import { matchSearchHaystack } from '../../lib/search-match';

const listCtlClass =
  'h-8 min-h-8 py-0 px-2.5 text-xs sm:text-sm leading-8 bg-white border border-gray-200 rounded-lg shadow-apple-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
import ProjectFormModal, {
  defaultProjectForm,
  projectFormToPayload,
  projectToForm,
} from '../../components/ProjectFormModal';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | {project}
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('end_date');
  const [sortDir, setSortDir] = useState('desc');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(defaultProjectForm());
  const [loadError, setLoadError] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const projectIds = useMemo(() => projects.map((p) => p.id).filter(Boolean), [projects]);
  const idsSortedKey = projectIds.length ? [...projectIds].sort().join('|') : null;
  const { data: msSummary = {}, mutate: mutateMsSum } = useSWR(
    idsSortedKey ? ['projects-page', 'ms-sum', idsSortedKey] : null,
    () => api.getMilestoneSummaryByProjects(projectIds)
  );
  const { data: msLists = {}, mutate: mutateMsLists } = useSWR(
    idsSortedKey ? ['projects-page', 'ms-lists', idsSortedKey] : null,
    () => api.getProjectMilestonesByProjects(projectIds)
  );

  useEffect(() => {
    const fn = () => {
      mutateMsSum(undefined, { revalidate: true });
      mutateMsLists(undefined, { revalidate: true });
    };
    window.addEventListener(MILESTONE_DATA_CHANGED_EVENT, fn);
    return () => window.removeEventListener(MILESTONE_DATA_CHANGED_EVENT, fn);
  }, [mutateMsSum, mutateMsLists]);

  const summaryByLc = useMemo(() => {
    const o = {};
    for (const [k, v] of Object.entries(msSummary)) o[String(k).toLowerCase()] = v;
    return o;
  }, [msSummary]);
  const listsByLc = useMemo(() => {
    const o = {};
    for (const [k, v] of Object.entries(msLists))
      o[String(k).toLowerCase()] = Array.isArray(v) ? v : [];
    return o;
  }, [msLists]);

  const refreshMilestones = useCallback(async () => {
    await Promise.all([
      mutateMsSum(undefined, { revalidate: true }),
      mutateMsLists(undefined, { revalidate: true }),
    ]);
  }, [mutateMsSum, mutateMsLists]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [p, c] = await Promise.all([api.getProjects(), api.getClients()]);
      setProjects(Array.isArray(p) ? p : []);
      setClients(Array.isArray(c) ? c : []);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || '無法載入專案或客戶資料');
      setProjects([]);
      setClients([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const openCreate = () => {
    setForm(defaultProjectForm());
    setModal('create');
  };
  const openEdit = (p) => {
    setForm(projectToForm(p));
    setModal(p);
  };

  const save = async (e) => {
    e.preventDefault();
    const data = projectFormToPayload(form);
    try {
      setSaveBusy(true);
      if (modal === 'create') {
        const created = await api.createProject(data);
        if (form.milestone_template) {
          try {
            await api.bootstrapProjectMilestones({
              project_id: created.id,
              template: form.milestone_template,
            });
          } catch (err) {
            console.error(err);
          }
        }
      } else await api.updateProject(modal.id, data);
      setModal(null);
      await load();
      notifyScheduleDataChanged();
    } catch (err) {
      console.error(err);
      alert(err?.message || String(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const del = async (p) => {
    if (!confirm(`刪除「${p.name}」？此操作無法撤銷。`)) return;
    await api.deleteProject(p.id);
    load();
  };

  const filtered = useMemo(() => {
    const q = filter.trim();
    const searched = q
      ? projects.filter((p) =>
          matchSearchHaystack([p.name, p.client_name].filter(Boolean).join(' '), q)
        )
      : projects;
    return filterAndSortProjects(searched, { sortBy, sortDir, statusFilter });
  }, [projects, filter, sortBy, sortDir, statusFilter]);

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
      <BackToDashboard className="mb-2 md:mb-4" />
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">專案</h1>
          <p className="text-gray-400 mt-0.5 md:mt-1 text-xs md:text-sm">{projects.length} 個專案</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-apple shadow-apple-sm transition-colors"
        >
          <span>＋</span> 新增專案
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-apple-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0">{loadError}</span>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setLoading(true);
                await load();
                setLoading(false);
              })();
            }}
            className="shrink-0 px-3 py-1.5 rounded-apple bg-white border border-rose-200 text-rose-900 font-medium text-xs hover:bg-rose-100"
          >
            重試
          </button>
        </div>
      )}

      <div className="pb-0.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2 sm:items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜尋專案或客戶…"
          className={`w-full sm:max-w-xs ${listCtlClass}`}
        />
        <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`flex-1 min-w-0 sm:flex-none sm:w-[6.75rem] ${listCtlClass}`}
            aria-label="狀態篩選"
          >
            <option value="">全部狀態</option>
            {PROJECT_STATUS_FILTER_OPTS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={`flex-1 min-w-0 sm:flex-none sm:w-[7.5rem] ${listCtlClass}`}
            aria-label="排序欄位"
          >
            {PROJECT_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className={`shrink-0 w-8 flex items-center justify-center font-medium text-gray-600 hover:bg-gray-50 ${listCtlClass}`}
            title={sortDir === 'desc' ? '由新到舊／Z→A' : '由舊到新／A→Z'}
            aria-label={sortDir === 'desc' ? '排序：遞減' : '排序：遞增'}
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
        {(sortBy === 'end_date' || sortBy === 'start_date') && (
          <p className="text-[10px] text-gray-400 leading-tight w-full sm:w-auto">
            已完成／已取消固定在最後
          </p>
        )}
      </div>
      </div>

      <div className={pageFrameScrollInsetClass}>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:gap-4">
          {filtered.map((p) => {
            const idLc = String(p.id).toLowerCase();
            return (
              <ProjectRow
                key={p.id}
                project={p}
                onEdit={openEdit}
                onDelete={del}
                milestoneSummary={summaryByLc[idLc]}
                milestones={listsByLc[idLc] || []}
                onMilestonesChanged={refreshMilestones}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="bg-white rounded-apple-lg shadow-apple p-16 text-center">
              <p className="text-gray-400 text-sm">尚無符合條件的專案</p>
              <button
                onClick={openCreate}
                className="mt-4 text-indigo-600 text-sm font-medium hover:text-indigo-700"
              >
                + 建立第一個專案
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {modal && (
        <ProjectFormModal
          title={modal === 'create' ? '新增專案' : '編輯專案'}
          mode={modal === 'create' ? 'create' : 'edit'}
          form={form}
          setForm={setForm}
          clients={clients}
          saveBusy={saveBusy}
          onClose={() => setModal(null)}
          onSubmit={save}
        />
      )}

    </div>
  );
}

function ProjectRow({
  project,
  onEdit,
  onDelete,
  milestoneSummary,
  milestones = [],
  onMilestonesChanged,
}) {
  const s = statusStyle(project.status);
  const [msBusyId, setMsBusyId] = useState(null);
  const empty = !milestoneSummary || !milestoneSummary.total;
  const pct = empty ? 0 : Math.round((milestoneSummary.completed / milestoneSummary.total) * 100);
  const sortedMs = useMemo(() => {
    return [...milestones].sort((a, b) => {
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [milestones]);

  const toggleMilestone = async (ms) => {
    try {
      setMsBusyId(ms.id);
      await api.updateProjectMilestone(ms.id, { completed: !ms.completed });
      await onMilestonesChanged?.();
      notifyMilestoneDataChanged();
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setMsBusyId(null);
    }
  };

  return (
    <div className={`${cardClass} flex flex-col gap-2 md:gap-2.5 hover:shadow-apple-lg duration-200 group`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0 py-0.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className="w-2.5 h-9 rounded-full shrink-0"
            style={{ backgroundColor: project.color || '#6366f1' }}
          />
          <div className="min-w-0 flex-1">
            <Link
              href={`/projects/${project.id}`}
              className="text-base font-semibold text-gray-900 hover:text-indigo-600 leading-tight"
            >
              {project.name}
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">
              <p className="text-[11px] text-gray-400">{project.client_name || '無客戶'}</p>
              <Link
                href={`/projects/${project.id}/schedule`}
                className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600"
              >
                甘特
              </Link>
            </div>
          </div>
        </div>
        <div className="hidden sm:contents">
          <div className="w-[9rem] shrink-0 text-right">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">時程</p>
            <p
              className="text-[11px] font-medium text-gray-600 tabular-nums leading-tight truncate"
              title={
                project.start_date
                  ? `${fmt(project.start_date)} — ${fmt(project.end_date)}`
                  : '未設定'
              }
            >
              {project.start_date
                ? `${fmt(project.start_date)} — ${fmt(project.end_date)}`
                : '未設定'}
            </p>
          </div>
          <div className="w-[5.25rem] shrink-0 text-right">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">預算</p>
            <p className="text-sm font-semibold text-gray-900 tabular-nums leading-tight">
              {project.budget ? fmtCurrency(project.budget) : '—'}
            </p>
          </div>
          <div className="w-[2.25rem] shrink-0 text-right">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">任務</p>
            <p className="text-sm font-semibold text-gray-900 tabular-nums">{project.task_count || 0}</p>
          </div>
          <div className="w-[5.25rem] shrink-0 flex justify-end">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.bg} ${s.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {project.status}
            </span>
          </div>
          <div className="flex gap-2 justify-end shrink-0 opacity-0 group-hover:opacity-100 min-w-[4.5rem]">
            <button
              type="button"
              onClick={() => onEdit(project)}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => onDelete(project)}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              刪除
            </button>
          </div>
        </div>
        <div className="sm:hidden flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-gray-600 pl-5">
          <span>
            {project.start_date
              ? `${fmt(project.start_date)} — ${fmt(project.end_date)}`
              : '時程未設定'}
          </span>
          <span className="font-semibold text-gray-900">
            {project.budget ? fmtCurrency(project.budget) : '—'}
          </span>
          <span>
            任務 {project.task_count || 0}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.bg} ${s.text}`}>{project.status}</span>
        </div>
      </div>

      <div className="hidden md:block w-full pt-3 border-t border-gray-100">
        <div className="relative h-6 w-full flex items-center">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: empty ? '4%' : `${pct}%`,
                backgroundColor: project.color || '#6366f1',
                opacity: 0.9,
              }}
            />
          </div>
        </div>
        {sortedMs.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1.5 items-center">
            {sortedMs.map((ms) => (
              <label
                key={ms.id}
                className={`inline-flex items-center gap-1.5 max-w-full rounded-full border px-2 py-0.5 text-[10px] leading-tight cursor-pointer select-none ${
                  ms.completed
                    ? 'border-gray-200 bg-gray-50 text-gray-400'
                    : 'border-indigo-200 bg-white text-gray-800 shadow-sm'
                } ${msBusyId === ms.id ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={!!ms.completed}
                  disabled={!!msBusyId}
                  onChange={() => toggleMilestone(ms)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  aria-label={`里程碑 ${ms.label}`}
                />
                <span className={`truncate ${ms.completed ? 'line-through' : 'font-medium'}`}>
                  {ms.label}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-gray-400">
            尚未設定里程碑 ·{' '}
            <Link
              href={`/projects/${project.id}#milestones`}
              className="text-indigo-600 hover:underline font-medium"
            >
              至專案設定
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

