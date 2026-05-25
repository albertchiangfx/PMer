import { format, formatDistance, parseISO, isValid, differenceInDays, addDays } from 'date-fns';

export function fmt(date, pattern = 'MMM d, yyyy') {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? format(d, pattern) : '—';
}

export function fmtRelative(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? formatDistance(d, new Date(), { addSuffix: true }) : '—';
}

export function fmtCurrency(amount, currency = 'TWD') {
  if (amount == null) return '—';
  const locale = currency === 'TWD' ? 'zh-TW' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function daysBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(
    0,
    differenceInDays(
      typeof end === 'string' ? parseISO(end) : end,
      typeof start === 'string' ? parseISO(start) : start
    ) + 1
  );
}

export function toISO(date) {
  if (!date) return null;
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
}

export function addDaysISO(dateStr, n) {
  return toISO(addDays(parseISO(dateStr), n));
}

export const STATUS_COLORS = {
  planning: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  active: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  completed: { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
  paused: { bg: 'bg-yellow-50', text: 'text-yellow-600', dot: 'bg-yellow-500' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  sent: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  paid: { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
  overdue: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  signed: { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
  expired: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  todo: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'in-progress': { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  review: { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-500' },
  done: { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
};

export function statusStyle(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.planning;
}

export function initials(name = '') {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function clx(...args) {
  return args.filter(Boolean).join(' ');
}
