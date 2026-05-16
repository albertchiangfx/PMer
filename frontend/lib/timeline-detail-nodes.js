/**
 * Normalize DB `timeline_detail_nodes` (JSONB array of { id, date, label }).
 */
export function parseTimelineDetailNodes(raw) {
  if (raw == null) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x === 'object' && x.date && x.label)
    .map((x) => ({
      id: String(x.id || `${x.date}-${x.label}`),
      date: String(x.date).slice(0, 10),
      label: String(x.label).trim(),
    }));
}
