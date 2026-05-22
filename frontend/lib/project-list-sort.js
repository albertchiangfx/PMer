/** 已結案／取消的專案在「依開案／結案時間」排序時固定墊底 */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

const STATUS_RANK = {
  planning: 0,
  active: 1,
  paused: 2,
  completed: 3,
  cancelled: 4,
};

function projectDateMs(p, field) {
  const raw = field === 'start' ? p.start_date : p.end_date;
  if (raw == null || raw === '') return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function terminalRank(p) {
  return TERMINAL_STATUSES.has(p.status) ? 1 : 0;
}

function compareByName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
}

function compareByDateField(a, b, field, dir) {
  const ta = terminalRank(a);
  const tb = terminalRank(b);
  if (ta !== tb) return ta - tb;

  const da = projectDateMs(a, field);
  const db = projectDateMs(b, field);
  if (da == null && db == null) return compareByName(a, b);
  if (da == null) return 1;
  if (db == null) return -1;
  const diff = da - db;
  if (diff !== 0) return diff * dir;
  return compareByName(a, b);
}

/**
 * @param {object[]} projects
 * @param {{ sortBy?: 'end_date'|'start_date'|'name'|'status', sortDir?: 'asc'|'desc', statusFilter?: string }} opts
 */
export function filterAndSortProjects(projects, opts = {}) {
  const { sortBy = 'end_date', sortDir = 'desc', statusFilter = '' } = opts;
  const dir = sortDir === 'asc' ? 1 : -1;

  let list = Array.isArray(projects) ? [...projects] : [];
  if (statusFilter) list = list.filter((p) => p.status === statusFilter);

  list.sort((a, b) => {
    if (sortBy === 'end_date') return compareByDateField(a, b, 'end', dir);
    if (sortBy === 'start_date') return compareByDateField(a, b, 'start', dir);

    if (sortBy === 'name') {
      const diff = compareByName(a, b);
      if (diff !== 0) return diff * dir;
      return compareByDateField(b, a, 'end', -1);
    }

    if (sortBy === 'status') {
      const ra = STATUS_RANK[a.status] ?? 99;
      const rb = STATUS_RANK[b.status] ?? 99;
      if (ra !== rb) return (ra - rb) * dir;
      return compareByDateField(b, a, 'end', -1);
    }

    return 0;
  });

  return list;
}

export const PROJECT_SORT_OPTIONS = [
  { value: 'end_date', label: '結案時間' },
  { value: 'start_date', label: '開案時間' },
  { value: 'name', label: '名稱' },
  { value: 'status', label: '狀態' },
];

export const PROJECT_STATUS_FILTER_OPTS = [
  '',
  'planning',
  'active',
  'paused',
  'completed',
  'cancelled',
];
