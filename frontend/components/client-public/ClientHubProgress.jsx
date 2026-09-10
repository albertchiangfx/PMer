'use client';

import { useMemo } from 'react';
import { fmt } from '../../lib/utils';

export default function ClientHubProgress({ project, progress, compact = false }) {
  const milestones = progress?.milestones || [];
  const pending = useMemo(() => milestones.filter((m) => !m.completed), [milestones]);

  if (compact) {
    return (
      <>
        <p className="client-public__section-label">製作進度</p>
        <div className="client-public__mobile-progress-line">
          <span className="client-public__status-pill">{project.status_label}</span>
          {progress.total > 0 && (
            <span className="client-public__meta-line">
              {progress.completed}/{progress.total} · {progress.percent}%
            </span>
          )}
        </div>
        {progress.next && (
          <p className="client-public__highlight" style={{ marginTop: '0.5rem' }}>
            <span className="client-public__highlight-k">下一步</span>
            {progress.next.label}
            {progress.next.date && (
              <span className="client-public__highlight-d"> · {fmt(progress.next.date)}</span>
            )}
          </p>
        )}
        {milestones.length > 0 && (
          <ul className="client-public__milestones-grid client-public__milestones-grid--compact">
            {milestones.map((m, i) => (
              <li key={i} className="client-public__milestone">
                <span
                  className={`client-public__milestone-dot ${m.completed ? 'client-public__milestone-dot--done' : ''}`}
                />
                <span className={m.completed ? 'client-public__milestone--done' : ''}>{m.label}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      <p className="client-public__section-label">製作進度</p>

      <div className="client-public__stat-grid">
        <div className="client-public__stat">
          <span className="client-public__stat-k">狀態</span>
          <span className="client-public__stat-v">{project.status_label}</span>
        </div>
        <div className="client-public__stat">
          <span className="client-public__stat-k">里程碑</span>
          <span className="client-public__stat-v">
            {progress.total > 0 ? `${progress.completed} / ${progress.total}` : '—'}
          </span>
        </div>
        <div className="client-public__stat">
          <span className="client-public__stat-k">完成度</span>
          <span className="client-public__stat-v">
            {progress.total > 0 ? `${progress.percent}%` : '—'}
          </span>
        </div>
      </div>

      {progress.total > 0 && (
        <div className="client-public__progress-track" aria-hidden>
          <div className="client-public__progress-fill" style={{ width: `${progress.percent}%` }} />
        </div>
      )}

      <div className="client-public__highlights">
        {progress.next && (
          <p className="client-public__highlight">
            <span className="client-public__highlight-k">下一步</span>
            {progress.next.label}
            {progress.next.date && (
              <span className="client-public__highlight-d"> · {fmt(progress.next.date)}</span>
            )}
          </p>
        )}
        {project.end_date && (
          <p className="client-public__highlight">
            <span className="client-public__highlight-k">預定完成</span>
            {fmt(project.end_date)}
          </p>
        )}
        {pending.length > 0 && !progress.next && (
          <p className="client-public__highlight">
            <span className="client-public__highlight-k">待完成</span>
            {pending.length} 項
          </p>
        )}
      </div>

      {milestones.length > 0 && (
        <ul className="client-public__milestones-grid">
          {milestones.map((m, i) => (
            <li key={i} className="client-public__milestone">
              <span
                className={`client-public__milestone-dot ${m.completed ? 'client-public__milestone-dot--done' : ''}`}
              />
              <span className={m.completed ? 'client-public__milestone--done' : ''}>{m.label}</span>
              {m.timeline_end_date && (
                <span className="client-public__milestone-date">{fmt(m.timeline_end_date)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
