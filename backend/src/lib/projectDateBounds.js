/** Postgres DATE / ISO string → YYYY-MM-DD (node-pg returns Date; String(date).slice(0,10) is wrong). */
function ymdFromDb(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Load project official start/end (DATE → YYYY-MM-DD). Returns null if missing either.
 */
async function fetchProjectBounds(db, projectId) {
  if (!projectId) return null;
  const { rows } = await db.query('SELECT start_date, end_date FROM projects WHERE id = $1', [
    projectId,
  ]);
  if (!rows.length) return null;
  const r = rows[0];
  const s = ymdFromDb(r.start_date);
  const e = ymdFromDb(r.end_date);
  if (!s || !e) return null;
  return { start: s, end: e };
}

/**
 * @returns {string|null} error message or null if OK / no bounds / partial dates
 */
function assertIntervalWithinBounds(startDate, endDate, bounds) {
  if (!bounds) return null;
  if (!startDate || !endDate) return null;
  const s = ymdFromDb(startDate);
  const e = ymdFromDb(endDate);
  if (!s || !e) return 'start_date and end_date must be valid dates';
  if (s > e) return 'start_date must be <= end_date';
  if (s < bounds.start || e > bounds.end) {
    return `起訖須在專案範圍內（${bounds.start}～${bounds.end}）`;
  }
  return null;
}

/**
 * After project start/end change: clamp member allocations, tasks, time_allocations,
 * and milestone timeline spans into [bounds.start, bounds.end].
 * Rows fully outside the window collapse to a single day on the nearest edge.
 * Skips entities with NULL dates (unchanged).
 * @param {import('pg').PoolClient} client
 * @param {string} projectId
 * @param {{ start: string, end: string }} bounds
 */
async function clampProjectDescendantsToBounds(client, projectId, bounds) {
  if (!bounds?.start || !bounds?.end || !projectId) return;
  const b1 = bounds.start;
  const b2 = bounds.end;
  const pid = projectId;

  const clampPairSql = `
    start_date = CASE
      WHEN end_date < $1::date THEN $1::date
      WHEN start_date > $2::date THEN $2::date
      ELSE GREATEST(start_date, $1::date)
    END,
    end_date = CASE
      WHEN end_date < $1::date THEN $1::date
      WHEN start_date > $2::date THEN $2::date
      ELSE LEAST(end_date, $2::date)
    END`;

  await client.query(
    `UPDATE allocations SET ${clampPairSql}
    WHERE project_id = $3::uuid
      AND NOT (start_date >= $1::date AND end_date <= $2::date)`,
    [b1, b2, pid]
  );

  await client.query(
    `UPDATE tasks SET ${clampPairSql}
    WHERE project_id = $3::uuid
      AND start_date IS NOT NULL AND end_date IS NOT NULL
      AND NOT (start_date >= $1::date AND end_date <= $2::date)`,
    [b1, b2, pid]
  );

  await client.query(
    `UPDATE time_allocations ta SET
      start_date = CASE
        WHEN ta.end_date < $1::date THEN $1::date
        WHEN ta.start_date > $2::date THEN $2::date
        ELSE GREATEST(ta.start_date, $1::date)
      END,
      end_date = CASE
        WHEN ta.end_date < $1::date THEN $1::date
        WHEN ta.start_date > $2::date THEN $2::date
        ELSE LEAST(ta.end_date, $2::date)
      END
    FROM tasks t
    WHERE ta.task_id = t.id AND t.project_id = $3::uuid
      AND ta.start_date IS NOT NULL AND ta.end_date IS NOT NULL
      AND NOT (ta.start_date >= $1::date AND ta.end_date <= $2::date)`,
    [b1, b2, pid]
  );

  await client.query(
    `UPDATE project_milestones SET
      timeline_start_date = CASE
        WHEN timeline_end_date < $1::date THEN $1::date
        WHEN timeline_start_date > $2::date THEN $2::date
        ELSE GREATEST(timeline_start_date, $1::date)
      END,
      timeline_end_date = CASE
        WHEN timeline_end_date < $1::date THEN $1::date
        WHEN timeline_start_date > $2::date THEN $2::date
        ELSE LEAST(timeline_end_date, $2::date)
      END
    WHERE project_id = $3::uuid
      AND timeline_start_date IS NOT NULL AND timeline_end_date IS NOT NULL
      AND NOT (timeline_start_date >= $1::date AND timeline_end_date <= $2::date)`,
    [b1, b2, pid]
  );
}

module.exports = {
  fetchProjectBounds,
  assertIntervalWithinBounds,
  clampProjectDescendantsToBounds,
};
