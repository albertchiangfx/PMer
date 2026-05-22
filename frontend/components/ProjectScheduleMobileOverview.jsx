'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { format, isValid, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { buildMilestoneSegments } from '../lib/milestone-segments';
import { nodeKindMeta } from '../lib/timeline-detail-nodes';
import {
  countWorkingDaysInclusive,
  loadEnabledHolidayCountries,
  loadHolidayIndex,
} from '../lib/public-holidays';
import { exportClientTimeline } from '../lib/client-timeline-export';
import { fmtCurrency } from '../lib/utils';

const MILESTONE_COLORS = [
  '#c7d2fe',
  '#bae6fd',
  '#a7f3d0',
  '#fde68a',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
];

function fmtYmd(d) {
  if (!d) return '—';
  if (d instanceof Date && isValid(d)) return format(d, 'yyyy-MM-dd');
  const s = String(d).slice(0, 10);
  const p = parseISO(s);
  return isValid(p) ? format(p, 'yyyy-MM-dd') : s;
}

export default function ProjectScheduleMobileOverview({ projectId, project }) {
  const { data: milestones = [], isLoading } = useSWR(
    projectId ? ['project-milestones', projectId] : null,
    () => api.getProjectMilestones(projectId)
  );

  const segments = useMemo(
    () => buildMilestoneSegments(project, milestones),
    [project, milestones]
  );

  const [holidayYmdSet, setHolidayYmdSet] = useState(() => new Set());

  useEffect(() => {
    if (!project?.start_date || !project?.end_date) {
      setHolidayYmdSet(new Set());
      return undefined;
    }
    let cancelled = false;
    const codes = loadEnabledHolidayCountries(projectId);
    loadHolidayIndex(project.start_date, project.end_date, codes)
      .then(({ dateSet }) => {
        if (!cancelled) setHolidayYmdSet(dateSet);
      })
      .catch(() => {
        if (!cancelled) setHolidayYmdSet(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, project?.start_date, project?.end_date]);

  const projectWorkingDays = useMemo(() => {
    if (!project?.start_date || !project?.end_date) return null;
    return countWorkingDaysInclusive(project.start_date, project.end_date, holidayYmdSet);
  }, [project?.start_date, project?.end_date, holidayYmdSet]);

  const workingDaysBySegId = useMemo(() => {
    const m = new Map();
    for (const s of segments) {
      m.set(s.id, countWorkingDaysInclusive(s.start, s.end, holidayYmdSet));
    }
    return m;
  }, [segments, holidayYmdSet]);

  const allNodes = useMemo(() => {
    const items = [];
    for (const s of segments) {
      for (const n of s.detailNodes || []) {
        if (n?.date && n?.label) {
          items.push({
            date: n.date,
            label: n.label,
            kind: n.kind,
            milestoneLabel: s.label,
          });
        }
      }
    }
    items.sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.milestoneLabel).localeCompare(String(b.milestoneLabel))
    );
    return items;
  }, [segments]);

  const period =
    project?.start_date && project?.end_date
      ? `${fmtYmd(project.start_date)} — ${fmtYmd(project.end_date)}`
      : '尚未設定專案起訖';

  const onExport = () => {
    void (async () => {
      try {
        const result = await exportClientTimeline(project, segments);
        if (result && !result.ok && result.message) alert(result.message);
      } catch (err) {
        alert(err?.message || '匯出失敗');
      }
    })();
  };

  if (isLoading) {
    return (
      <div className="surface rounded-xl p-6 text-center text-sm text-slate-500">
        載入時程中…
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pb-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2.5 text-sm text-indigo-950">
        <p className="font-semibold">手機版：閱讀與匯出</p>
        <p className="mt-1 text-[13px] text-indigo-900/90 leading-relaxed">
          調整項目時程、拖曳色條與節點請使用電腦版。此頁為整理過的時程總覽。
        </p>
      </div>

      <section className="surface rounded-xl p-3 space-y-2.5">
        <h2 className="text-sm font-bold text-slate-900">專案時程</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
            <dt className="text-slate-500 shrink-0">起訖</dt>
            <dd className="font-medium text-slate-900 text-right tabular-nums">{period}</dd>
          </div>
          {projectWorkingDays != null ? (
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500 shrink-0">工作天</dt>
              <dd className="font-medium text-slate-900 tabular-nums">{projectWorkingDays} 天</dd>
            </div>
          ) : null}
          {project?.budget != null && project?.budget !== '' ? (
            <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
              <dt className="text-slate-500 shrink-0">預算</dt>
              <dd className="font-medium text-slate-900">{fmtCurrency(project.budget)}</dd>
            </div>
          ) : null}
          {project?.client_name ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500 shrink-0">客戶</dt>
              <dd className="font-medium text-slate-900 text-right">{project.client_name}</dd>
            </div>
          ) : null}
        </dl>
        {segments.length > 0 ? (
          <button
            type="button"
            onClick={onExport}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm active:bg-indigo-700"
          >
            匯出客戶時間軸
          </button>
        ) : null}
      </section>

      <section className="surface rounded-xl p-3">
        <h2 className="text-sm font-bold text-slate-900 mb-3">項目（{segments.length}）</h2>
        {segments.length === 0 ? (
          <p className="text-sm text-slate-500">尚無項目。請在電腦版「項目」分頁套用公版或新增。</p>
        ) : (
          <ul className="space-y-3">
            {segments.map((seg, i) => {
              const wd = workingDaysBySegId.get(seg.id);
              const color = MILESTONE_COLORS[i % MILESTONE_COLORS.length];
              return (
                <li
                  key={seg.id}
                  className={`rounded-lg border p-2.5 ${
                    seg.completed ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0 mt-0.5 border border-slate-200"
                      style={{ backgroundColor: seg.completed ? '#10b981' : color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-semibold text-slate-900 leading-snug ${
                          seg.completed ? 'line-through text-emerald-900/80' : ''
                        }`}
                      >
                        {seg.label}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 tabular-nums">
                        {fmtYmd(seg.start)} — {fmtYmd(seg.end)}
                        {wd != null ? ` · ${wd} 工作天` : ''}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="surface rounded-xl p-3">
        <h2 className="text-sm font-bold text-slate-900 mb-3">
          時程節點（{allNodes.length}）
        </h2>
        {allNodes.length === 0 ? (
          <p className="text-sm text-slate-500">尚無節點。</p>
        ) : (
          <ul className="space-y-2">
            {allNodes.map((n, idx) => {
              const meta = nodeKindMeta(n.kind);
              return (
                <li
                  key={`${n.date}-${n.label}-${idx}`}
                  className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-900 tabular-nums">{n.date}</p>
                    <p className="text-slate-700 mt-0.5">{n.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.milestoneLabel}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
