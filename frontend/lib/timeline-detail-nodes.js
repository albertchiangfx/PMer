/** 節點類型（存入 JSONB，無需 migration） */
export const NODE_KINDS = [
  { id: 'delivery', label: '交付', color: '#3b82f6' },
  { id: 'feedback', label: '客戶反饋', color: '#f59e0b' },
  { id: 'internal', label: '內部備註', color: '#64748b' },
  { id: 'other', label: '其他', color: '#8b5cf6' },
];

export function nodeKindMeta(kind) {
  return NODE_KINDS.find((k) => k.id === kind) || NODE_KINDS[NODE_KINDS.length - 1];
}

/**
 * Normalize DB `timeline_detail_nodes` (JSONB array of { id, date, label, kind? }).
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
    .map((x) => {
      const kindRaw = x.kind ? String(x.kind) : 'other';
      const kind = NODE_KINDS.some((k) => k.id === kindRaw) ? kindRaw : 'other';
      return {
        id: String(x.id || `${x.date}-${x.label}`),
        date: String(x.date).slice(0, 10),
        label: String(x.label).trim(),
        kind,
      };
    });
}
