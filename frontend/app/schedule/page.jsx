'use client';

import { useCallback, useEffect, useState } from 'react';
import BackToDashboard from '../../components/BackToDashboard';
import SchedulePanel from '../../components/SchedulePanel';
import StudioVerticalSchedule from '../../components/StudioVerticalSchedule';
import { api } from '../../lib/api';
import {
  pageFrameClass,
  pageFrameHeaderClass,
  pageFrameScrollClass,
} from '../../lib/page-layout';
import { useIsMobileLayout } from '../../lib/use-mobile-layout';

export default function SchedulePage() {
  const isMobileLayout = useIsMobileLayout();
  const [projects, setProjects] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, a, m] = await Promise.all([
      api.getProjects(),
      api.getAllocations(),
      api.getTeamMembers({ status: 'active' }),
    ]);
    setProjects(Array.isArray(p) ? p : []);
    setAllocations(Array.isArray(a) ? a : []);
    setMembers(Array.isArray(m) ? m : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <div className={pageFrameClass}>
      <div className={pageFrameHeaderClass}>
        <BackToDashboard className="mb-2 md:mb-4" />
        {!isMobileLayout ? (
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">
            工作時程
          </h1>
        ) : null}
      </div>
      {isMobileLayout ? (
        loading ? (
          <div className="py-12 text-center text-sm text-slate-500">載入時程…</div>
        ) : (
          <StudioVerticalSchedule
            title="工作時程"
            showDesktopLink={false}
            projects={projects}
            allocations={allocations}
            members={members}
          />
        )
      ) : (
        <div className={`${pageFrameScrollClass} min-h-0`}>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">載入時程…</div>
          ) : (
            <SchedulePanel title="工作時程" />
          )}
        </div>
      )}
    </div>
  );
}
